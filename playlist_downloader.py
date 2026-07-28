#!/usr/bin/env python3
"""
playlist_downloader.py — Download de playlist via yt-dlp + empacotamento em ZIP.

Não depende de torch, Demucs ou Basic Pitch — somente yt-dlp e ffmpeg.
Resiliente: ignora vídeos indisponíveis (--ignoreerrors) e continua.

Saídas no stdout (capturadas pelo Node.js via SSE):
    [playlist] <N> vídeos | <título da playlist>
    [video]    <índice>/<total> | <título>
    [download] <XX.X%> | <índice>/<total> | <título>
    [downloaded] <filename>
    [zipping]  <N> arquivos
    ZIP_PATH:<caminho absoluto do ZIP>
    [done]     <N> arquivos baixados
"""

import argparse
import io
import logging
import sys
import zipfile
from pathlib import Path

# ── UTF-8 no Windows ──────────────────────────────────────────────────────────
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("playlist_downloader")


# ── Args ──────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Baixa uma playlist completa e empacota em ZIP.")
    p.add_argument("url",        type=str,  help="URL da playlist")
    p.add_argument("output_dir", type=Path, help="Diretório de destino dos arquivos")
    p.add_argument("--download-type",  choices=["audio", "video"], default="audio")
    p.add_argument("--audio-quality",  choices=["128", "192", "320"], default="192")
    p.add_argument("--video-quality",  choices=["720", "1080", "best"], default="best")
    return p.parse_args()


# ── Logger silencioso para o yt-dlp ──────────────────────────────────────────

class _YdlLogger:
    """Redireciona logs do yt-dlp para o logger padrão e rastreia vídeo atual."""

    def __init__(self, state: dict) -> None:
        self._state = state

    def debug(self, msg: str) -> None:
        # "Downloading item X of Y" → atualiza índice
        if "Downloading item" in msg:
            try:
                parts = msg.split()
                idx = int(parts[parts.index("item") + 1])
                total_str = parts[parts.index("item") + 3]
                self._state["index"] = idx
                self._state["total"] = int(total_str)
                log.info("[video] %d/%d", idx, self._state["total"])
            except Exception:
                pass
        # "[download] Destination: ..." → título do arquivo atual
        if "Destination:" in msg:
            filename = msg.split("Destination:")[-1].strip()
            self._state["title"] = Path(filename).stem
            print(
                f"[video] {self._state['index']}/{self._state['total']} | {self._state['title']}",
                flush=True,
            )

    def warning(self, msg: str) -> None:
        log.warning(msg)

    def error(self, msg: str) -> None:
        log.error(msg)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()

    try:
        import yt_dlp
    except ImportError:
        log.error("yt-dlp não instalado. Execute: pip install yt-dlp")
        sys.exit(1)

    output_dir: Path = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    state: dict = {"index": 0, "total": 0, "title": ""}

    # ── Passo 1: descobrir total e título da playlist (flat, sem baixar) ──────
    info_opts: dict = {
        "quiet":        True,
        "no_warnings":  True,
        "extract_flat": True,
        "skip_download": True,
        "noplaylist":   False,
    }
    playlist_title = "playlist"
    with yt_dlp.YoutubeDL(info_opts) as ydl:
        try:
            info = ydl.extract_info(args.url, download=False)
            entries = [e for e in (info.get("entries") or []) if e]
            state["total"] = len(entries)
            playlist_title = info.get("title") or "playlist"
        except Exception as exc:
            log.warning("Não foi possível obter metadados da playlist: %s", exc)

    safe_title = "".join(c for c in playlist_title if c.isalnum() or c in " -_").strip()[:50] or "playlist"
    print(f"[playlist] {state['total']} vídeos | {playlist_title}", flush=True)

    # ── Passo 2: configurar opções do yt-dlp ──────────────────────────────────
    VIDEO_FORMAT_MAP = {
        "720":  "bestvideo[height<=720]+bestaudio/best[height<=720]",
        "1080": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        "best": "bestvideo+bestaudio/best",
    }

    def progress_hook(d: dict) -> None:
        if d["status"] == "downloading":
            pct = d.get("_percent_str", "").strip()
            if not pct or pct == "N/A%":
                return
            print(
                f"[download] {pct} | {state['index']}/{state['total']} | {state['title']}",
                flush=True,
            )
        elif d["status"] == "finished":
            fname = Path(d.get("filename", "")).name
            print(f"[downloaded] {fname}", flush=True)

    # Template com índice da playlist para ordenação natural
    outtmpl = str(output_dir / "%(playlist_index)s - %(title)s.%(ext)s")

    if args.download_type == "video":
        fmt = VIDEO_FORMAT_MAP.get(args.video_quality, VIDEO_FORMAT_MAP["best"])
        ydl_opts: dict = {
            "format":              fmt,
            "outtmpl":             outtmpl,
            "merge_output_format": "mp4",
            "noplaylist":          False,
            "ignoreerrors":        True,   # pula vídeos indisponíveis
            "progress_hooks":      [progress_hook],
            "logger":              _YdlLogger(state),
        }
    else:
        ydl_opts = {
            "format":         "bestaudio[ext=m4a]/bestaudio/best",
            "outtmpl":        outtmpl,
            "postprocessors": [{
                "key":              "FFmpegExtractAudio",
                "preferredcodec":   "mp3",
                "preferredquality": args.audio_quality,
            }],
            "noplaylist":     False,
            "ignoreerrors":   True,    # pula vídeos indisponíveis
            "progress_hooks": [progress_hook],
            "logger":         _YdlLogger(state),
        }

    # ── Passo 3: download de todos os vídeos ──────────────────────────────────
    log.info("Iniciando download da playlist: %s", args.url)
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            ydl.download([args.url])
        except Exception as exc:
            # ignoreerrors absorve a maioria, mas em caso de falha catastrófica:
            log.error("Erro inesperado durante download: %s", exc)

    # ── Passo 4: compactar tudo em ZIP ────────────────────────────────────────
    files = sorted([f for f in output_dir.iterdir() if f.is_file()])
    if not files:
        log.error("Nenhum arquivo foi baixado.")
        sys.exit(1)

    zip_path = output_dir.parent / f"{safe_title}.zip"
    print(f"[zipping] {len(files)} arquivos", flush=True)
    log.info("Criando ZIP: %s  (%d arquivos)", zip_path, len(files))

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, f.name)
            log.info("  + %s", f.name)

    print(f"ZIP_PATH:{zip_path}", flush=True)
    print(f"[done] {len(files)} arquivos baixados", flush=True)
    log.info("Concluído! ZIP: %s", zip_path)


if __name__ == "__main__":
    main()
