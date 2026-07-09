import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabJson } from '../types/TabJson';
import styles from './LandingPage.module.css';

interface LibraryEntry {
  songId: string;
  title: string;
  artist: string | null;
  bpm: number | null;
  totalNotes: number | null;
  tuning: string | null;
  tabId: string | null;
  createdAt: string;
}

interface Props {
  onUploaded: (jobId: string, audioUrl: string) => void;
  onLoadSong: (tabJson: TabJson, audioUrl: string, title: string) => void;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(iso));
}

export function LandingPage({ onUploaded, onLoadSong }: Props) {
  const [library,    setLibrary]    = useState<LibraryEntry[]>([]);
  const [libLoading, setLibLoading] = useState(true);
  const [dragging,   setDragging]   = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadErr,  setUploadErr]  = useState<string | null>(null);
  const [loadingId,  setLoadingId]  = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/library')
      .then((r) => r.json())
      .then((d) => { setLibrary(d); setLibLoading(false); })
      .catch(() => setLibLoading(false));
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(mp3|wav|flac|ogg|m4a)$/i)) {
      setUploadErr('Formato não suportado. Use .mp3, .wav, .flac, .ogg ou .m4a');
      return;
    }
    setUploadErr(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error(res.statusText);
      const { jobId, audioUrl } = await res.json();
      onUploaded(jobId, audioUrl);
    } catch (e) {
      setUploadErr(`Upload falhou: ${e}`);
      setUploading(false);
    }
  }, [onUploaded]);

  const handleLoadSong = async (song: LibraryEntry) => {
    if (!song.tabId || loadingId) return;
    setLoadingId(song.songId);
    try {
      const res = await fetch(`/api/songs/${song.songId}/tablature`);
      if (!res.ok) throw new Error(res.statusText);
      const { tabJson, audioUrl, title } = await res.json();
      onLoadSong(tabJson as TabJson, audioUrl as string, title as string);
    } catch (e) {
      alert(`Erro ao carregar: ${e}`);
      setLoadingId(null);
    }
  };

  return (
    <div className={styles.root}>
      {/* ── Animated background ─────────────────────────────────────────── */}
      <div className={styles.bg} aria-hidden>
        <div className={styles.orb1} /><div className={styles.orb2} /><div className={styles.orb3} />
        <div className={styles.dotGrid} />
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.navLogo}>🎸 <span>Bass Tab</span></div>
        <div className={styles.navLinks}>
          <a href="#library" className={styles.navLink}>Biblioteca</a>
          <a href="#upload"  className={styles.navCta}>⬆ Upload</a>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <span className={styles.badgeDot} />
          Powered by Demucs &amp; Basic Pitch
        </div>

        <h1 className={styles.heroTitle}>
          Transforme Qualquer Áudio<br />
          <span className={styles.heroGrad}>em Tablatura de Baixo</span>
        </h1>

        <p className={styles.heroSub}>
          Inteligência artificial separa o baixo, transcreve para MIDI e entrega
          uma tablatura interativa com player sincronizado em 60fps.
        </p>

        {/* Waveform decoration */}
        <div className={styles.waveform} aria-hidden>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className={styles.waveBar} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>

        <a href="#upload" className={styles.heroCta}>⬆ Começar agora</a>

        {/* Pipeline steps */}
        <div className={styles.pipeline}>
          {[
            { icon: '🎵', step: '01', label: 'Upload', desc: '.mp3, .wav, .flac…' },
            { icon: '🤖', step: '02', label: 'IA Analisa', desc: 'Demucs + Basic Pitch' },
            { icon: '🎸', step: '03', label: 'Player', desc: 'Tablatura sincronizada' },
          ].map((s, i) => (
            <div key={i} className={styles.pipeItem}>
              <div className={styles.pipeStep}>{s.step}</div>
              <div className={styles.pipeIcon}>{s.icon}</div>
              <p className={styles.pipeLabel}>{s.label}</p>
              <p className={styles.pipeDesc}>{s.desc}</p>
              {i < 2 && <div className={styles.pipeArrow}>→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── Library ─────────────────────────────────────────────────────── */}
      <section id="library" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Sua Biblioteca</h2>
          {library.length > 0 && (
            <span className={styles.sectionBadge}>{library.length} músicas</span>
          )}
        </div>

        {libLoading ? (
          <div className={styles.stateBox}><div className={styles.spinner} /></div>
        ) : library.length === 0 ? (
          <div className={styles.stateBox}>
            <span className={styles.emptyIcon}>🎵</span>
            <p className={styles.emptyText}>Nenhuma música ainda</p>
            <p className={styles.emptyHint}>Faça o upload de um áudio para começar.</p>
          </div>
        ) : (
          <div className={styles.libGrid}>
            {library.map((song) => {
              const isLoading = loadingId === song.songId;
              return (
                <button
                  key={song.songId}
                  className={styles.songCard}
                  onClick={() => handleLoadSong(song)}
                  disabled={!song.tabId || loadingId !== null}
                  aria-label={`Reproduzir ${song.title}`}
                >
                  <div className={styles.songPlayBtn}>
                    {isLoading
                      ? <span className={styles.miniSpinner} />
                      : <span className={styles.playIcon}>▶</span>}
                  </div>
                  <div className={styles.songInfo}>
                    <p className={styles.songTitle}>{song.title}</p>
                    <p className={styles.songMeta}>
                      {song.tuning ?? 'EADG'} ·{' '}
                      {song.bpm ? `${Math.round(song.bpm)} BPM` : '—'} ·{' '}
                      {song.totalNotes ?? 0} notas
                    </p>
                  </div>
                  <span className={styles.songDate}>{formatDate(song.createdAt)}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Upload ──────────────────────────────────────────────────────── */}
      <section id="upload" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Nova Transcrição</h2>
        </div>

        <div
          className={`${styles.dropzone} ${dragging ? styles.dzDragging : ''} ${uploading ? styles.dzUploading : ''}`}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragging(false);
            const f = e.dataTransfer.files[0]; if (f) handleFile(f);
          }}
        >
          <input
            ref={fileInputRef} type="file" accept=".mp3,.wav,.flac,.ogg,.m4a"
            className={styles.hidden}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {uploading ? (
            <div className={styles.dzState}>
              <div className={styles.spinner} />
              <p>Enviando arquivo…</p>
            </div>
          ) : (
            <div className={styles.dzState}>
              <span className={styles.dzIcon}>{dragging ? '⬇' : '🎵'}</span>
              <p className={styles.dzLabel}>
                {dragging ? 'Solte aqui!' : 'Arraste um arquivo de áudio'}
              </p>
              <p className={styles.dzHint}>ou clique para selecionar</p>
              <div className={styles.dzFormats}>
                {['.mp3', '.wav', '.flac', '.ogg', '.m4a'].map((f) => (
                  <span key={f} className={styles.dzFormat}>{f}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {uploadErr && <p className={styles.uploadErr}>⚠️ {uploadErr}</p>}

        <div className={styles.pipelineNote}>
          <span>ℹ️</span>
          <p>O processamento usa Demucs (separação de fonte) e Basic Pitch (transcrição).
             Com GPU pode levar 30s, em CPU até 3min dependendo do áudio.</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <p>🎸 Bass Tab Generator · Demucs + Basic Pitch + React · {new Date().getFullYear()}</p>
        <a
          href="https://github.com/Amadeus-Moura/Bass-Tab-Generator-"
          target="_blank" rel="noreferrer"
          className={styles.footerLink}
        >
          GitHub →
        </a>
      </footer>
    </div>
  );
}
