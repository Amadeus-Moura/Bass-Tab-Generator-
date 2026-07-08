import * as fs from 'fs';
import { Midi } from '@tonejs/midi';
import type { Track } from '@tonejs/midi';
import { TimedNote } from '../../domain/entities';
import { NoteExtractor } from '../../application/ports/noteExtractor';
import { MidiToNoteAdapter } from './midiToNoteAdapter';
import { RawMidiPayload } from './midiTypes';

/**
 * GM (General MIDI) program numbers for bass instruments (0-indexed).
 * Programs 32–39 cover all standard bass timbres.
 */
const GM_BASS_PROGRAM_MIN = 32;
const GM_BASS_PROGRAM_MAX = 39;

/**
 * Infrastructure — Real-file MIDI adapter.
 *
 * Reads a physical `.mid` file from disk, selects the most appropriate
 * bass track, and returns a monophonic, chronologically ordered TimedNote[].
 *
 * ## Design decision — delegation over duplication
 *
 * This adapter does NOT re-implement note conversion or monophonic
 * filtering. Instead it converts the @tonejs/midi output into our own
 * `RawMidiPayload` shape and delegates to `MidiToNoteAdapter`, which
 * already owns that logic (TIME_EPSILON, chord filtering, MIDI → TimedNote).
 * This keeps the two adapters composable and the logic in one place.
 *
 * ## Bass track heuristic (priority order)
 *
 * 1. Track whose name contains "bass" (case-insensitive).
 * 2. Track whose GM instrument program is in the bass range (32–39).
 * 3. First track that has at least one note.
 */
export class RealMidiFileAdapter implements NoteExtractor<string> {
  /**
   * The BPM extracted from the last parsed file.
   * Populated during extract() and exposed for the pipeline to read.
   */
  public lastBpm: number = 120;

  constructor(private readonly innerAdapter: MidiToNoteAdapter) {}

  /**
   * Reads a MIDI file and extracts a bass note sequence from it.
   *
   * @param filePath - Absolute or relative path to a `.mid` file.
   * @returns Chronological, monophonic TimedNote[] for the selected bass track.
   * @throws {Error} If the file cannot be read or contains no usable tracks.
   */
  extract(filePath: string): TimedNote[] {
    const buffer = fs.readFileSync(filePath);
    const midi = new Midi(buffer);

    if (midi.tracks.length === 0) {
      throw new Error(
        `RealMidiFileAdapter: "${filePath}" contains no MIDI tracks.`,
      );
    }

    // Capture BPM for use by the pipeline (falls back to 120 if not set).
    this.lastBpm = midi.header.tempos[0]?.bpm ?? 120;

    const selectedTrack = this.selectBassTrack(midi.tracks);

    if (!selectedTrack) {
      throw new Error(
        `RealMidiFileAdapter: "${filePath}" has no tracks with notes. ` +
          `Verify the file is a valid MIDI with at least one note event.`,
      );
    }

    // Convert @tonejs/midi track → RawMidiPayload → delegate all processing.
    const payload: RawMidiPayload = {
      bpm: this.lastBpm,
      tracks: [
        {
          name: selectedTrack.name,
          notes: selectedTrack.notes.map((n) => ({
            midi: n.midi,
            time: n.time,
            duration: n.duration,
            velocity: n.velocity,
          })),
        },
      ],
    };

    return this.innerAdapter.extract(payload);
  }

  /**
   * Selects the most appropriate bass track from a parsed MIDI file.
   *
   * @param tracks - All tracks in the MIDI file.
   * @returns The selected Track, or null if all tracks are empty.
   */
  private selectBassTrack(tracks: readonly Track[]): Track | null {
    const tracksWithNotes = tracks.filter((t) => t.notes.length > 0);

    if (tracksWithNotes.length === 0) {
      return null;
    }

    // Priority 1: track name contains "bass" (case-insensitive).
    const byName = tracksWithNotes.find((t) =>
      t.name.toLowerCase().includes('bass'),
    );
    if (byName) return byName;

    // Priority 2: GM instrument program in the bass range (32–39).
    const byProgram = tracksWithNotes.find(
      (t) =>
        t.instrument.number >= GM_BASS_PROGRAM_MIN &&
        t.instrument.number <= GM_BASS_PROGRAM_MAX,
    );
    if (byProgram) return byProgram;

    // Fallback: first track that has notes.
    return tracksWithNotes[0];
  }
}
