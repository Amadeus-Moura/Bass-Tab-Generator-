#!/usr/bin/env python3
"""
bass_extractor.py — ML pipeline: MP3 → isolated bass → MIDI

Pipeline:
  1. Source separation via Meta's Demucs (htdemucs_ft model)
     → isolates the bass stem from drums, vocals, other instruments
  2. Audio-to-MIDI transcription via Spotify's Basic Pitch
     → converts the isolated bass WAV to a MIDI file
  3. Output saved as test.mid in the current working directory
  4. Temporary audio files cleaned up automatically

Usage:
  python bass_extractor.py input.mp3
  python bass_extractor.py /path/to/song.wav --model htdemucs
  python bass_extractor.py input.mp3 --output my_bass.mid --keep-stems
"""

import argparse
import logging
import shutil
import subprocess
import sys
from pathlib import Path

import torch

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bass_extractor")


# ---------------------------------------------------------------------------
# Step 0 — Device detection
# ---------------------------------------------------------------------------

def detect_device() -> str:
    """
    Returns 'cuda' if a CUDA-capable GPU is available, otherwise 'cpu'.
    Logs the device name for traceability.
    """
    if torch.cuda.is_available():
        name = torch.cuda.get_device_name(0)
        log.info("GPU detected: %s — using CUDA acceleration.", name)
        return "cuda"

    log.warning("No CUDA GPU detected. Falling back to CPU (slower).")
    return "cpu"


# ---------------------------------------------------------------------------
# Step 1 — Source separation (Demucs)
# ---------------------------------------------------------------------------

def separate_bass(
    input_path: Path,
    temp_dir: Path,
    model: str,
    device: str,
) -> Path:
    """
    Runs Demucs to isolate the bass stem from the input audio file.

    Uses ``demucs.separate.main`` (the same entry point as the CLI) to
    avoid a subprocess round-trip while keeping the full feature set.

    Args:
        input_path: Path to the source audio file (.mp3, .wav, .flac).
        temp_dir:   Temporary output directory for Demucs stems.
        model:      Demucs model name (e.g. 'htdemucs_ft', 'htdemucs').
        device:     Torch device string ('cuda' or 'cpu').

    Returns:
        Path to the isolated bass WAV file.

    Raises:
        FileNotFoundError: If Demucs does not produce the expected bass stem.
    """
    log.info("Step 1/2 — Source separation  [model: %s | device: %s]", model, device)
    log.info("  Input:  %s", input_path)

    import demucs.separate  # imported here to keep startup fast if import fails

    # --two-stems bass produces only bass.wav + no_bass.wav (faster than 4-stem).
    demucs_args = [
        "--two-stems", "bass",
        "--name", model,
        "--device", device,
        "--out", str(temp_dir),
        str(input_path),
    ]

    log.info("  Running Demucs (this may take a few minutes)…")
    demucs.separate.main(demucs_args)

    # Demucs output path: <temp_dir>/<model>/<track_stem>/bass.wav
    bass_path = temp_dir / model / input_path.stem / "bass.wav"

    if not bass_path.exists():
        # Fallback: search recursively in case the model creates a subdirectory
        candidates = list(temp_dir.rglob("bass.wav"))
        if not candidates:
            raise FileNotFoundError(
                f"Demucs did not produce a bass stem. "
                f"Expected: {bass_path}\n"
                f"Contents of temp dir: {list(temp_dir.rglob('*'))}"
            )
        bass_path = candidates[0]
        log.warning("  Bass stem found at unexpected path: %s", bass_path)

    log.info("  Bass stem isolated: %s", bass_path)
    return bass_path


# ---------------------------------------------------------------------------
# Step 2 — Audio-to-MIDI transcription (Basic Pitch)
# ---------------------------------------------------------------------------

def transcribe_to_midi(bass_wav: Path, output_midi: Path) -> None:
    """
    Transcribes an isolated bass WAV file to MIDI using Spotify's Basic Pitch.

    Basic Pitch is instrument-agnostic and polyphony-aware. For bass guitar
    the default thresholds work well; onset sensitivity is slightly lowered
    to reduce ghost note artifacts common in bass recordings.

    Args:
        bass_wav:    Path to the isolated bass audio file (.wav).
        output_midi: Destination path for the generated MIDI file.

    Raises:
        RuntimeError: If Basic Pitch fails to produce a MIDI object.
    """
    log.info("Step 2/2 — MIDI transcription  [basic-pitch]")
    log.info("  Input:  %s", bass_wav)

    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    # predict() returns (model_output_dict, pretty_midi_object, note_events_list)
    log.info("  Running Basic Pitch inference (TensorFlow)…")
    _, midi_data, note_events = predict(
        audio_path=str(bass_wav),
        model_or_model_path=ICASSP_2022_MODEL_PATH,
        # Lower onset threshold reduces false positives on sustained bass notes.
        onset_threshold=0.4,
        # Frame threshold controls note segmentation sensitivity.
        frame_threshold=0.3,
        # Minimum note length in ms — filters out very short artifacts.
        minimum_note_length=100,
        # Bass guitar range: MIDI 28 (E1) to 84 (C6).
        minimum_frequency=41.2,   # E1 ≈ 41.2 Hz
        maximum_frequency=1046.5, # C6 ≈ 1046.5 Hz
    )

    if midi_data is None:
        raise RuntimeError(
            "Basic Pitch returned no MIDI data. "
            "The bass audio may be too quiet or heavily distorted."
        )

    log.info("  Transcribed %d note events.", len(note_events))

    midi_data.write(str(output_midi))
    log.info("  MIDI saved: %s", output_midi)


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def cleanup(temp_dir: Path) -> None:
    """Removes the temporary Demucs output directory."""
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
        log.info("Temporary files removed: %s", temp_dir)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract bass from an audio file and convert it to MIDI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "input",
        type=Path,
        help="Path to the source audio file (.mp3, .wav, .flac, …).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("test.mid"),
        help="Destination MIDI file path (default: test.mid in current directory).",
    )
    parser.add_argument(
        "--model",
        default="htdemucs_ft",
        choices=["htdemucs", "htdemucs_ft", "mdx_extra", "mdx_extra_q"],
        help=(
            "Demucs model to use for source separation. "
            "'htdemucs_ft' (default) gives the best quality but is slower. "
            "'htdemucs' is faster with slightly lower quality."
        ),
    )
    parser.add_argument(
        "--keep-stems",
        action="store_true",
        help="Keep the temporary Demucs stem files instead of deleting them.",
    )
    parser.add_argument(
        "--cpu",
        action="store_true",
        help="Force CPU inference even if a GPU is available.",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()

    input_path: Path = args.input.resolve()
    output_midi: Path = args.output.resolve()
    temp_dir: Path = output_midi.parent / ".bass_extractor_tmp"

    # --- Validate input ---
    if not input_path.exists():
        log.error("Input file not found: %s", input_path)
        sys.exit(1)

    log.info("=" * 60)
    log.info("Bass Extractor — ML Audio Pipeline")
    log.info("=" * 60)
    log.info("Input audio : %s", input_path)
    log.info("Output MIDI : %s", output_midi)

    # --- Device selection ---
    device = "cpu" if args.cpu else detect_device()

    # --- Run pipeline ---
    try:
        temp_dir.mkdir(parents=True, exist_ok=True)

        bass_wav = separate_bass(input_path, temp_dir, args.model, device)
        transcribe_to_midi(bass_wav, output_midi)

    except KeyboardInterrupt:
        log.warning("Interrupted by user.")
        sys.exit(130)

    except Exception as exc:
        log.error("Pipeline failed: %s", exc, exc_info=True)
        sys.exit(1)

    finally:
        if not args.keep_stems:
            cleanup(temp_dir)

    log.info("=" * 60)
    log.info("Done! MIDI file ready: %s", output_midi)
    log.info(
        "Next step: copy '%s' to the Node.js project root and run: npm start",
        output_midi.name,
    )
    log.info("=" * 60)


if __name__ == "__main__":
    main()
