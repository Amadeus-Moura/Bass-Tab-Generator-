import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './PlaylistPage.module.css';

// ── Tipos ──────────────────────────────────────────────────────────────────────

type AudioQuality = '128' | '192' | '320';
type VideoQuality = '720' | '1080' | 'best';
type Phase        = 'idle' | 'running' | 'done' | 'error';

interface SseEvent {
  stage:        string;
  message:      string;
  progress?:    number;
  total?:       number;
  current?:     number;
  zipUrl?:      string | null;
  zipFilename?: string | null;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function PlaylistPage() {
  const [url,          setUrl]          = useState('');
  const [downloadType, setDownloadType] = useState<'audio' | 'video'>('audio');
  const [audioQuality, setAudioQuality] = useState<AudioQuality>('192');
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('best');

  const [phase,    setPhase]    = useState<Phase>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [total,    setTotal]    = useState(0);
  const [current,  setCurrent]  = useState(0);
  const [logs,     setLogs]     = useState<string[]>([]);
  const [zipUrl,   setZipUrl]   = useState<string | null>(null);
  const [zipName,  setZipName]  = useState<string | null>(null);

  const reset = () => {
    setPhase('idle'); setError(null); setProgress(0);
    setTotal(0); setCurrent(0); setLogs([]); setZipUrl(null); setZipName(null);
  };

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) { setError('Cole uma URL de playlist.'); return; }
    if (!url.startsWith('http')) { setError('URL inválida — deve começar com http:// ou https://.'); return; }
    setError(null); setPhase('running'); setProgress(2); setLogs([]);

    try {
      // 1) Registra o job
      const res = await fetch('/api/start-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), downloadType, audioQuality, videoQuality }),
      });
      if (!res.ok) { const { error: msg } = await res.json(); throw new Error(msg); }
      const { jobId } = await res.json();

      // 2) Conecta SSE
      const es = new EventSource(`/api/playlist-stream/${encodeURIComponent(jobId)}`);
      es.onmessage = (e) => {
        const data: SseEvent = JSON.parse(e.data);
        if (data.progress !== undefined) setProgress(data.progress);
        if (data.total    !== undefined) setTotal(data.total);
        if (data.current  !== undefined) setCurrent(data.current);
        setLogs(prev => [...prev.slice(-80), data.message]); // mantém últimas 80 linhas

        if (data.stage === 'done') {
          es.close();
          setZipUrl(data.zipUrl ?? null);
          setZipName(data.zipFilename ?? null);
          setPhase('done');
        }
        if (data.stage === 'error') {
          es.close();
          setError(data.message);
          setPhase('error');
        }
      };
      es.onerror = () => {
        es.close();
        setError('Conexão perdida. Verifique o servidor.');
        setPhase('error');
      };
    } catch (e) {
      setError(String(e));
      setPhase('error');
    }
  }, [url, downloadType, audioQuality, videoQuality]);

  const isRunning = phase === 'running';
  const isDone    = phase === 'done';

  return (
    <div className={styles.root}>
      {/* BG */}
      <div className={styles.bg} aria-hidden>
        <div className={styles.orb1} /><div className={styles.orb2} />
        <div className={styles.grid} />
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        <Link to="/" className={styles.navLogo}>
          <span>📋</span><span>Playlist</span>
        </Link>
        <div className={styles.navLinks}>
          <Link to="/"         className={styles.navLink}>Início</Link>
          <Link to="/library"  className={styles.navLink}>Biblioteca</Link>
          <Link to="/upload"   className={styles.navLink}>Download</Link>
          <Link to="/playlist" className={`${styles.navLink} ${styles.navActive}`}>Playlist</Link>
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.shell}>

          {/* Header */}
          <div className={styles.pageHead}>
            <h1 className={styles.pageTitle}>📋 Download de Playlist</h1>
            <p className={styles.pageSub}>
              Cola a URL de qualquer playlist do YouTube — baixa tudo e entrega um ZIP
            </p>
          </div>

          {/* ── IDLE / DONE ───────────────────────────────────────────────────── */}
          {!isRunning && (
            <>
              {/* URL */}
              <div className={styles.card}>
                <div className={styles.cardLabel}>URL da Playlist</div>
                <div className={`${styles.urlBox} ${url ? styles.urlBoxActive : ''}`}>
                  <span className={styles.plIcon}>📋</span>
                  <input
                    id="playlist-url-input"
                    type="url"
                    className={styles.urlInput}
                    placeholder="https://youtube.com/playlist?list=... ou watch?v=...&list=..."
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    autoComplete="off"
                    disabled={isRunning}
                  />
                  {url && <button className={styles.clearBtn} onClick={() => setUrl('')}>✕</button>}
                </div>
                <p className={styles.urlHint}>
                  yt-dlp suporta playlists do YouTube, SoundCloud, Bandcamp e +1800 sites.
                  Vídeos indisponíveis são ignorados automaticamente.
                </p>
              </div>

              {/* Tipo */}
              <div className={styles.card}>
                <div className={styles.cardLabel}>Formato</div>
                <div className={styles.typeRow}>
                  <button
                    id="type-audio"
                    className={`${styles.typeChip} ${downloadType === 'audio' ? styles.typeChipActive : ''}`}
                    onClick={() => setDownloadType('audio')}
                  >🎵 MP3</button>
                  <button
                    id="type-video"
                    className={`${styles.typeChip} ${downloadType === 'video' ? styles.typeChipActive : ''}`}
                    onClick={() => setDownloadType('video')}
                  >🎬 MP4</button>
                </div>

                {/* Qualidade */}
                {downloadType === 'audio' ? (
                  <div className={styles.qualityGrid}>
                    {(['128','192','320'] as AudioQuality[]).map(v => (
                      <button key={v} id={`aq-${v}`}
                        className={`${styles.qualityCard} ${audioQuality === v ? styles.qualityCardActive : ''}`}
                        onClick={() => setAudioQuality(v)}>
                        <span className={styles.qualityLabel}>{v} kbps</span>
                        <span className={styles.qualityTag}>{v === '128' ? 'Econômico' : v === '192' ? 'Recomendado' : 'Alta fidelidade'}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.qualityGrid}>
                    {([['720','720p','HD'],['1080','1080p','Full HD'],['best','Melhor','4K/2K']] as [VideoQuality,string,string][]).map(([v,label,tag]) => (
                      <button key={v} id={`vq-${v}`}
                        className={`${styles.qualityCard} ${videoQuality === v ? styles.qualityCardActive : ''}`}
                        onClick={() => setVideoQuality(v)}>
                        <span className={styles.qualityLabel}>{label}</span>
                        <span className={styles.qualityTag}>{tag}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className={styles.errorMsg}>⚠️ {error}</p>}

              {/* Aviso ZIP */}
              <div className={styles.infoCard}>
                <span>📦</span>
                <p>Todos os arquivos serão baixados numa pasta e entregues como <strong>um único ZIP</strong> para download.</p>
              </div>

              {/* CTA */}
              <button
                id="playlist-submit-btn"
                className={styles.cta}
                onClick={phase === 'done' ? reset : handleSubmit}
                disabled={!url.trim() || phase === 'error'}
              >
                {isDone ? '↺ Nova playlist' : '📋 Baixar playlist'}
              </button>
            </>
          )}

          {/* ── RUNNING ───────────────────────────────────────────────────────── */}
          {isRunning && (
            <div className={styles.progressCard}>
              <div className={styles.procTop}>
                <div className={styles.pulseRing} />
                <span className={styles.procEmoji}>📥</span>
              </div>

              <h2 className={styles.procTitle}>Baixando playlist…</h2>
              {total > 0 && (
                <p className={styles.procSub}>{current} / {total} vídeos</p>
              )}

              {/* Barra principal */}
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${progress}%` }} />
              </div>
              <div className={styles.barMeta}>
                <span className={styles.barPct}>{progress}%</span>
              </div>

              {/* Log de progresso */}
              <div className={styles.logBox}>
                {logs.slice(-10).map((l, i) => (
                  <p key={i} className={styles.logLine}>{l}</p>
                ))}
              </div>

              <button className={styles.cancelBtn} onClick={reset}>✕ Cancelar</button>
            </div>
          )}

          {/* ── DONE ──────────────────────────────────────────────────────────── */}
          {isDone && zipUrl && (
            <div className={styles.doneCard}>
              <div className={styles.doneIcon}>📦</div>
              <div className={styles.doneBody}>
                <p className={styles.doneTitle}>Playlist pronta!</p>
                <p className={styles.doneSub}>{zipName ?? 'playlist.zip'}</p>
              </div>
              <a
                id="download-zip-btn"
                href={zipUrl}
                download
                className={styles.doneBtn}
              >
                ⬇ Baixar ZIP
              </a>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
