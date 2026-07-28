#!/usr/bin/env python3
"""
bass_extractor.py — Media Processing Pipeline: URL/File → Isolated Bass → MIDI

Modos de operação:
  1. [Arquivo local]  Recebe um arquivo de áudio e executa Demucs + Basic Pitch.
  2. [URL do YouTube] Usa o yt-dlp para baixar a mídia antes de processar.

Pipeline completo (com --url):
  0. Download via yt-dlp         → salva mídia em disco (áudio ou vídeo)
  1. Separação de fonte (Demucs) → isola o stem de baixo
  2. Transcrição MIDI (Basic P.) → converte o WAV do baixo em MIDI
  3. Limpeza automática dos stems temporários do Demucs

Saídas controladas via flags:
  --download-type audio|video    → define o formato do download (padrão: audio)
  --output-media <path>          → caminho onde o arquivo de mídia será salvo
  --skip-tab                     → baixa a mídia mas NÃO roda Demucs/Basic Pitch

Usage:
  # Apenas gerar tablatura a partir de arquivo local:
  python bass_extractor.py input.mp3

  # Baixar áudio do YouTube e gerar tablatura:
  python bass_extractor.py --url "https://youtube.com/watch?v=..." --output my_bass.mid

  # Baixar vídeo e salvar (sem gerar tablatura):
  python bass_extractor.py --url "https://youtube.com/watch?v=..." --download-type video --skip-tab

  # Baixar áudio, salvar em caminho específico, E gerar tablatura:
  python bass_extractor.py --url "https://youtube.com/watch?v=..." --output-media ./uploads/song.mp3
"""

import argparse
import io
import logging
import os
import shutil
import sys
from pathlib import Path

# Garante stdout/stderr em UTF-8 no Windows (evita corrupção de caminhos com acentos)
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# torch é importado lazily em detect_device() para não bloquear modos leves
# (--list-playlist, --skip-tab) com a inicialização pesada do CUDA.

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
# Step 0a — Device detection
# ---------------------------------------------------------------------------

def detect_device() -> str:
    """
    Retorna 'cuda' se houver GPU disponível, caso contrário 'cpu'.
    Importa o torch aqui (lazy) para não bloquear modos que não precisam de ML.
    """
    import torch  # noqa: PLC0415
    if torch.cuda.is_available():
        name = torch.cuda.get_device_name(0)
        log.info("GPU detectada: %s — usando aceleração CUDA.", name)
        return "cuda"

    log.warning("Nenhuma GPU CUDA detectada. Usando CPU (mais lento).")
    return "cpu"


# ---------------------------------------------------------------------------
# Step 0b — Download via yt-dlp (novo)
# ---------------------------------------------------------------------------

def download_media(
    url: str,
    output_path: Path,
    download_type: str,
    audio_quality: str = "192",
    video_quality: str = "best",
) -> Path:
    """
    Baixa mídia de uma URL do YouTube (ou qualquer site suportado pelo yt-dlp)
    usando a API Python nativa do yt-dlp, sem subprocess.

    Args:
        url:           URL do vídeo/playlist do YouTube.
        output_path:   Caminho de destino do arquivo baixado (sem extensão).
                       O yt-dlp adiciona a extensão automaticamente.
        download_type: 'audio' para extrair somente áudio (mp3/m4a),
                       'video' para baixar vídeo+áudio em melhor qualidade.

    Returns:
        Path para o arquivo de mídia baixado (com a extensão correta).

    Raises:
        RuntimeError: Se o yt-dlp falhar ou nenhum arquivo for produzido.
    """
    try:
        import yt_dlp  # noqa: PLC0415  (import inside function — intencional)
    except ImportError as e:
        raise RuntimeError(
            f"Não foi possível importar yt_dlp. "
            f"Execute: pip install yt-dlp\n"
            f"Detalhe: {e}"
        ) from e

    # Garante que o diretório de destino existe
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Template de saída: ex: /uploads/abc123  → yt-dlp adiciona .mp3 ou .mp4
    outtmpl = str(output_path)

    # Mapeia qualidade de vídeo para seletor de formato do yt-dlp
    VIDEO_FORMAT_MAP = {
        "720":  "bestvideo[height<=720]+bestaudio/best[height<=720]",
        "1080": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        "best": "bestvideo+bestaudio/best",
    }

    # Opções comuns de performance
    COMMON_OPTS = {
        "quiet":                         False,
        "no_warnings":                   False,
        "progress_hooks":                [_ytdlp_progress_hook],
        "postprocessor_hooks":           [_ytdlp_pp_hook],   # detecta início/fim do FFmpeg
        "concurrent_fragment_downloads": 4,
        "buffersize":                    1024 * 64,
        "retries":                       3,
        "fragment_retries":              3,
        "noprogress":                    False,
        # Garante que apenas o vídeo da URL é baixado,
        # ignorando parâmetros &list= (playlists, Radio Mix, etc.)
        "noplaylist":                    True,
    }

    if download_type == "video":
        log.info("Step 0/2 — Download de VÍDEO via yt-dlp  [qualidade: %s]", video_quality)
        log.info("  URL: %s", url)
        fmt = VIDEO_FORMAT_MAP.get(video_quality, VIDEO_FORMAT_MAP["best"])
        ydl_opts = {
            **COMMON_OPTS,
            "format":              fmt,
            "outtmpl":             outtmpl,
            "merge_output_format": "mp4",
        }
        expected_ext = ".mp4"
    else:
        # Para áudio: prefere m4a nativo (evita conversão FFmpeg quando possível),
        # mas sempre converte para MP3 no final para compatibilidade.
        log.info("Step 0/2 — Download de ÁUDIO via yt-dlp  [qualidade: %s kbps]", audio_quality)
        log.info("  URL: %s", url)
        ydl_opts = {
            **COMMON_OPTS,
            "format":          "bestaudio[ext=m4a]/bestaudio/best",
            "outtmpl":         outtmpl,
            "postprocessors": [{
                "key":              "FFmpegExtractAudio",
                "preferredcodec":   "mp3",
                "preferredquality": str(audio_quality),
            }],
        }
        expected_ext = ".mp3"

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        error_code = ydl.download([url])
        if error_code != 0:
            raise RuntimeError(f"yt-dlp falhou com código de saída {error_code}.")

    # Localiza o arquivo produzido (yt-dlp pode adicionar extensão automaticamente)
    candidate = output_path.with_suffix(expected_ext)
    if candidate.exists():
        log.info("  Mídia salva: %s", candidate)
        return candidate

    # Fallback: procura qualquer arquivo recém-criado no mesmo diretório
    siblings = sorted(
        output_path.parent.glob(f"{output_path.name}*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if siblings:
        log.warning("  Arquivo esperado (%s) não encontrado. Usando: %s", candidate, siblings[0])
        return siblings[0]

    raise RuntimeError(
        f"yt-dlp terminou sem erros, mas nenhum arquivo de mídia foi encontrado em: "
        f"{output_path.parent}"
    )


def _ytdlp_progress_hook(d: dict) -> None:
    """Hook de progresso do yt-dlp — imprime via stdout para o Node.js capturar."""
    if d["status"] == "downloading":
        pct_raw = d.get("_percent_str", "").strip()
        # Ignora linhas sem porcentagem válida (fragmentos individuais podem omitir)
        if not pct_raw or pct_raw == "N/A%":
            return
        spd = d.get("_speed_str", "?").strip()
        eta = d.get("_eta_str", "?").strip()
        print(f"[download] {pct_raw} at {spd} ETA {eta}", flush=True)
        log.info("  [yt-dlp] %s  velocidade: %s  ETA: %s", pct_raw, spd, eta)
    elif d["status"] == "error":
        log.error("  [yt-dlp] Erro durante o download.")
    # NÃO imprimimos nada para "finished" de fragmento — evita falso positivo de 100%


def _ytdlp_pp_hook(d: dict) -> None:
    """Hook de pós-processamento — sinaliza quando o FFmpeg está convertendo."""
    if d["status"] == "started":
        pp = d.get("postprocessor", "")
        if "FFmpeg" in pp or "Extract" in pp:
            print("[converting] Convertendo para MP3...", flush=True)
            log.info("  [ffmpeg] Iniciando conversão...")
    elif d["status"] == "finished":
        print("[converting] done", flush=True)
        log.info("  [ffmpeg] Conversão concluída.")


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
    Executa o Demucs para isolar o stem de baixo do arquivo de áudio de entrada.

    Args:
        input_path: Caminho para o arquivo de áudio (.mp3, .wav, .flac).
        temp_dir:   Diretório temporário de saída para os stems do Demucs.
        model:      Nome do modelo Demucs (ex: 'htdemucs_ft', 'htdemucs').
        device:     String do dispositivo Torch ('cuda' ou 'cpu').

    Returns:
        Caminho para o arquivo WAV do baixo isolado.

    Raises:
        FileNotFoundError: Se o Demucs não produzir o stem de baixo esperado.
    """
    log.info("Step 1/2 — Separação de fonte  [modelo: %s | device: %s]", model, device)
    log.info("  Entrada:  %s", input_path)

    import demucs.separate  # importado aqui para acelerar inicialização

    # --two-stems bass produz apenas bass.wav + no_bass.wav (mais rápido que 4 stems)
    demucs_args = [
        "--two-stems", "bass",
        "--name", model,
        "--device", device,
        "--out", str(temp_dir),
        str(input_path),
    ]

    log.info("  Rodando Demucs (pode levar alguns minutos)…")
    demucs.separate.main(demucs_args)

    # Caminho de saída do Demucs: <temp_dir>/<model>/<track_stem>/bass.wav
    bass_path = temp_dir / model / input_path.stem / "bass.wav"

    if not bass_path.exists():
        # Fallback: busca recursiva caso o modelo crie subdiretório diferente
        candidates = list(temp_dir.rglob("bass.wav"))
        if not candidates:
            raise FileNotFoundError(
                f"O Demucs não produziu o stem de baixo. "
                f"Esperado: {bass_path}\n"
                f"Conteúdo do diretório temporário: {list(temp_dir.rglob('*'))}"
            )
        bass_path = candidates[0]
        log.warning("  Stem de baixo encontrado em caminho inesperado: %s", bass_path)

    log.info("  Stem de baixo isolado: %s", bass_path)
    return bass_path


# ---------------------------------------------------------------------------
# Step 2 — Audio-to-MIDI transcription (Basic Pitch)
# ---------------------------------------------------------------------------

def transcribe_to_midi(bass_wav: Path, output_midi: Path) -> None:
    """
    Transcreve um arquivo WAV de baixo isolado para MIDI usando o Basic Pitch.

    Args:
        bass_wav:    Caminho para o arquivo WAV de baixo isolado.
        output_midi: Caminho de destino para o arquivo MIDI gerado.

    Raises:
        RuntimeError: Se o Basic Pitch não produzir dados MIDI.
    """
    log.info("Step 2/2 — Transcrição MIDI  [basic-pitch]")
    log.info("  Entrada:  %s", bass_wav)

    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    # predict() retorna (model_output_dict, pretty_midi_object, note_events_list)
    log.info("  Rodando inferência do Basic Pitch (TensorFlow)…")
    _, midi_data, note_events = predict(
        audio_path=str(bass_wav),
        model_or_model_path=ICASSP_2022_MODEL_PATH,
        # Limiar de onset reduzido → menos falsos positivos em notas sustentadas
        onset_threshold=0.4,
        # Limiar de frame → sensibilidade de segmentação de notas
        frame_threshold=0.3,
        # Duração mínima da nota (ms) → filtra artefatos muito curtos
        minimum_note_length=100,
        # Range do baixo elétrico: MIDI 28 (E1) a 84 (C6)
        minimum_frequency=41.2,   # E1 ≈ 41.2 Hz
        maximum_frequency=1046.5, # C6 ≈ 1046.5 Hz
    )

    if midi_data is None:
        raise RuntimeError(
            "O Basic Pitch não retornou dados MIDI. "
            "O áudio do baixo pode estar muito silencioso ou muito distorcido."
        )

    log.info("  %d eventos de nota transcritos.", len(note_events))

    midi_data.write(str(output_midi))
    log.info("  MIDI salvo: %s", output_midi)


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def cleanup(temp_dir: Path) -> None:
    """Remove o diretório temporário de saída do Demucs."""
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
        log.info("Arquivos temporários removidos: %s", temp_dir)


# ---------------------------------------------------------------------------
# Playlist enumeration (sem download)
# ---------------------------------------------------------------------------

def list_playlist_videos(url: str) -> None:
    """
    Enumera os vídeos de uma playlist do YouTube (ou outro site suportado pelo yt-dlp)
    sem baixar nenhum conteúdo. Imprime uma linha JSON por vídeo no stdout.

    Cada linha: { "id": str, "url": str, "title": str, "duration": int|null }
    """
    import json
    try:
        import yt_dlp
    except ImportError as e:
        log.error("yt_dlp não instalado: %s", e)
        sys.exit(1)

    ydl_opts = {
        "quiet":        True,
        "no_warnings":  True,
        "extract_flat": "in_playlist",  # não processa cada vídeo, só lista
        "skip_download": True,
    }

    log.info("Enumerando playlist: %s", url)
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except Exception as exc:
            log.error("Falha ao ler playlist: %s", exc)
            sys.exit(1)

    entries = info.get("entries") or []
    count = 0
    for entry in entries:
        if not entry:
            continue
        video_id  = entry.get("id", "")
        video_url = entry.get("url") or (
            f"https://www.youtube.com/watch?v={video_id}" if video_id else None
        )
        if not video_url:
            continue
        print(json.dumps({
            "id":       video_id,
            "url":      video_url,
            "title":    entry.get("title") or "Vídeo",
            "duration": entry.get("duration"),
        }, ensure_ascii=False), flush=True)
        count += 1

    log.info("%d vídeos encontrados na playlist.", count)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pipeline de processamento de mídia: download, separação de baixo e transcrição MIDI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # ── Fonte de entrada (mutuamente exclusivos) ─────────────────────────────
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "input",
        nargs="?",
        type=Path,
        default=None,
        help="Caminho para o arquivo de áudio local (.mp3, .wav, .flac, …).",
    )
    source_group.add_argument(
        "--url",
        type=str,
        metavar="YOUTUBE_URL",
        help="URL do YouTube (ou outro site suportado pelo yt-dlp) para baixar antes de processar.",
    )
    source_group.add_argument(
        "--list-playlist",
        type=str,
        metavar="PLAYLIST_URL",
        dest="list_playlist",
        help=(
            "Enumera os vídeos de uma playlist sem baixar nada. "
            "Imprime uma linha JSON por vídeo no stdout e encerra."
        ),
    )

    # ── Opções de download (relevantes apenas com --url) ─────────────────────
    parser.add_argument(
        "--download-type",
        choices=["audio", "video"],
        default="audio",
        help=(
            "Tipo de mídia a baixar via yt-dlp. "
            "'audio' (padrão) baixa somente o áudio como MP3. "
            "'video' baixa o melhor vídeo + áudio como MP4."
        ),
    )
    parser.add_argument(
        "--audio-quality",
        default="192",
        choices=["128", "192", "320"],
        help="Qualidade do MP3 em kbps (padrão: 192).",
    )
    parser.add_argument(
        "--video-quality",
        default="best",
        choices=["720", "1080", "best"],
        help="Resolução máxima do vídeo (padrão: best).",
    )
    parser.add_argument(
        "--output-media",
        type=Path,
        default=None,
        metavar="PATH",
        help=(
            "Caminho completo onde o arquivo de mídia baixado será salvo "
            "(sem extensão — o yt-dlp adiciona automaticamente). "
            "Se não informado, salva em 'uploads/<timestamp>' no root do projeto."
        ),
    )
    parser.add_argument(
        "--skip-tab",
        action="store_true",
        help=(
            "Baixa a mídia via yt-dlp mas NÃO executa Demucs/Basic Pitch. "
            "Use quando a intenção é apenas download_audio ou download_video."
        ),
    )

    # ── Opções do pipeline ML ────────────────────────────────────────────────
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("test.mid"),
        help="Caminho de destino para o arquivo MIDI gerado (padrão: test.mid no diretório atual).",
    )
    parser.add_argument(
        "--model",
        default="htdemucs",
        choices=["htdemucs", "htdemucs_ft", "mdx_extra", "mdx_extra_q"],
        help=(
            "Modelo Demucs para separação de fonte. "
            "'htdemucs' (padrão) é 30-40%% mais rápido que htdemucs_ft com qualidade próxima."
        ),
    )
    parser.add_argument(
        "--keep-stems",
        action="store_true",
        help="Mantém os arquivos de stem temporários do Demucs ao invés de apagá-los.",
    )
    parser.add_argument(
        "--cpu",
        action="store_true",
        help="Força o uso da CPU mesmo que uma GPU esteja disponível.",
    )

    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()

    # ── Modo --list-playlist: apenas enumera vídeos e encerra ────────────────
    if getattr(args, 'list_playlist', None):
        list_playlist_videos(args.list_playlist)
        return

    output_midi: Path = args.output.resolve()
    temp_dir: Path    = output_midi.parent / ".bass_extractor_tmp"

    log.info("=" * 60)
    log.info("Media Processing Pipeline")
    log.info("=" * 60)


    # ── Etapa 0: Determinar o arquivo de entrada (local ou YouTube) ──────────
    if args.url:
        # Define onde salvar a mídia baixada
        if args.output_media:
            media_dest = args.output_media.resolve()
        else:
            # Padrão: <project_root>/uploads/<timestamp>
            project_root = Path(__file__).parent
            import time
            timestamp = int(time.time() * 1000)
            media_dest = project_root / "uploads" / str(timestamp)

        log.info("Modo: Download via yt-dlp")
        log.info("URL:  %s", args.url)
        log.info("Tipo: %s", args.download_type)
        log.info("Destino da mídia: %s.*", media_dest)

        try:
            downloaded_file = download_media(
                args.url,
                media_dest,
                args.download_type,
                audio_quality=args.audio_quality,
                video_quality=args.video_quality,
            )
        except Exception as exc:
            log.error("Falha no download: %s", exc, exc_info=True)
            sys.exit(1)

        # Imprime o caminho final para que o Node.js possa capturá-lo via stdout
        print(f"MEDIA_PATH:{downloaded_file}", flush=True)

        if args.skip_tab:
            log.info("--skip-tab ativado. Pipeline de tablatura ignorado.")
            log.info("Arquivo de mídia pronto: %s", downloaded_file)
            sys.exit(0)

        # Continua o pipeline usando o arquivo baixado como entrada
        input_path = downloaded_file

    else:
        # Arquivo local passado como argumento posicional
        input_path = args.input.resolve()
        if not input_path.exists():
            log.error("Arquivo de entrada não encontrado: %s", input_path)
            sys.exit(1)

    log.info("Entrada de áudio : %s", input_path)
    log.info("Saída MIDI       : %s", output_midi)

    # ── Etapa 1 & 2: Separação + Transcrição MIDI ────────────────────────────
    device = "cpu" if args.cpu else detect_device()

    try:
        temp_dir.mkdir(parents=True, exist_ok=True)

        bass_wav = separate_bass(input_path, temp_dir, args.model, device)
        transcribe_to_midi(bass_wav, output_midi)

    except KeyboardInterrupt:
        log.warning("Interrompido pelo usuário.")
        sys.exit(130)

    except Exception as exc:
        log.error("Pipeline falhou: %s", exc, exc_info=True)
        sys.exit(1)

    finally:
        if not args.keep_stems:
            cleanup(temp_dir)

    log.info("=" * 60)
    log.info("Concluído! MIDI pronto: %s", output_midi)
    log.info("=" * 60)


if __name__ == "__main__":
    main()
