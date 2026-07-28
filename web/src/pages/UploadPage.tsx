import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './UploadPage.module.css';

// ── Tipos ──────────────────────────────────────────────────────────────────────

type InputMode    = 'url' | 'other' | 'file';
type Phase        = 'idle' | 'uploading' | 'processing' | 'batch';
type AudioQuality = '128' | '192' | '320';
type VideoQuality = '720' | '1080' | 'best';

interface SseEvent {
  stage:        string;
  message:      string;
  progress?:    number;
  tabJson?:     unknown;
  downloadUrl?: string;
}

interface PlaylistEntry {
  id:        string;
  url:       string;
  title:     string;
  duration?: number;
}

interface BatchJob {
  jobId:        string;
  title:        string;
  url:          string;
  status:       'pending' | 'running' | 'done' | 'error';
  progress:     number;
  message:      string;
  downloadUrl?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function UploadPage() {
  const navigate = useNavigate();

  // Entrada
  const [inputMode,  setInputMode]  = useState<InputMode>('url');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [dragging,   setDragging]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Intenções independentes (podem coexistir)
  const [wantDownload, setWantDownload] = useState(true);
  const [wantTab,      setWantTab]      = useState(false);

  // Sub-opções de download
  const [downloadType, setDownloadType] = useState<'audio' | 'video'>('audio');
  const [audioQuality, setAudioQuality] = useState<AudioQuality>('192');
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('best');

  // Pipeline state
  const [phase,       setPhase]       = useState<Phase>('idle');
  const [error,       setError]       = useState<string | null>(null);
  const [progress,    setProgress]    = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [steps,       setSteps]       = useState<SseEvent[]>([]);

  // Playlist state
  const [playlistEntries,  setPlaylistEntries]  = useState<PlaylistEntry[] | null>(null);
  const [loadingPlaylist,  setLoadingPlaylist]  = useState(false);
  const [batchJobs,        setBatchJobs]        = useState<Record<string, BatchJob>>({});

  // URL tem parâmetro list= → é uma playlist
  const isPlaylistUrl = inputMode === 'url' && /[?&]list=/.test(youtubeUrl);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const reset = () => {
    setPhase('idle'); setError(null);
    setProgress(0); setDownloadUrl(null); setSteps([]);
    setPlaylistEntries(null); setBatchJobs({});
  };

  const fmtDuration = (s?: number) => {
    if (!s) return '';
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ── Carregar info da playlist ────────────────────────────────────────────────
  const loadPlaylistInfo = useCallback(async () => {
    if (!youtubeUrl.trim()) return;
    setLoadingPlaylist(true);
    setPlaylistEntries(null);
    setError(null);
    try {
      const res = await fetch(`/api/playlist-info?url=${encodeURIComponent(youtubeUrl.trim())}`);
      if (!res.ok) { const { error: msg } = await res.json(); throw new Error(msg); }
      const { entries } = await res.json();
      setPlaylistEntries(entries as PlaylistEntry[]);
    } catch (e) { setError(`Não foi possível carregar a playlist: ${e}`); }
    finally { setLoadingPlaylist(false); }
  }, [youtubeUrl]);

  // ── Batch submit (playlist) ──────────────────────────────────────────────────
  const handlePlaylistSubmit = useCallback(async () => {
    if (!playlistEntries?.length) return;
    if (!wantDownload && !wantTab) { setError('Selecione pelo menos uma ação.'); return; }
    setError(null);

    const intents: string[] = [];
    if (wantDownload) intents.push(downloadType === 'video' ? 'download_video' : 'download_audio');
    if (wantTab)      intents.push('generate_tab');
    const resolvedIntents = intents.length > 0 ? intents : ['generate_tab'];

    // Cria todos os jobs
    const jobs: Record<string, BatchJob> = {};
    for (const entry of playlistEntries) {
      try {
        const res = await fetch('/api/process-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: entry.url, intents: resolvedIntents, audioQuality, videoQuality }),
        });
        if (!res.ok) continue;
        const { jobId } = await res.json();
        jobs[jobId] = { jobId, url: entry.url, title: entry.title, status: 'pending', progress: 0, message: 'Aguardando…' };
      } catch { /* pula vídeo com erro */ }
    }

    setBatchJobs(jobs);
    setPhase('batch');

    // Roda os jobs sequencialmente via SSE
    for (const job of Object.values(jobs)) {
      setBatchJobs(prev => ({
        ...prev,
        [job.jobId]: { ...prev[job.jobId], status: 'running' }
      }));
      
      await new Promise<void>((resolve) => {
        const es = new EventSource(`/api/process/${encodeURIComponent(job.jobId)}`);
        es.onmessage = (e) => {
          const data: SseEvent = JSON.parse(e.data);
          setBatchJobs(prev => {
            const currentJob = prev[job.jobId];
            if (!currentJob) return prev;
            return {
              ...prev,
              [job.jobId]: {
                ...currentJob,
                status:      data.stage === 'done' ? 'done' : data.stage === 'error' ? 'error' : 'running',
                progress:    data.progress ?? currentJob.progress,
                message:     data.message,
                downloadUrl: data.downloadUrl ?? currentJob.downloadUrl,
              }
            };
          });
          if (data.stage === 'done' || data.stage === 'error') { es.close(); resolve(); }
        };
        es.onerror = () => { es.close(); resolve(); };
      });
    }
  }, [playlistEntries, wantDownload, wantTab, downloadType, audioQuality, videoQuality]);

  // ── SSE ─────────────────────────────────────────────────────────────────────

  const connectSse = useCallback((jobId: string) => {
    const es = new EventSource(`/api/process/${encodeURIComponent(jobId)}`);
    es.onmessage = (e) => {
      const data: SseEvent = JSON.parse(e.data);
      setProgress(data.progress ?? 0);
      setSteps(p => [...p, data]);
      if (data.stage === 'done') {
        es.close();
        if (data.downloadUrl) setDownloadUrl(data.downloadUrl);
        setTimeout(() => navigate('/library'), 6000);
      }
      if (data.stage === 'error') {
        es.close(); setError(data.message); setPhase('idle');
      }
    };
    es.onerror = () => {
      es.close();
      setError('Conexão perdida. Verifique se o servidor está rodando.');
      setPhase('idle');
    };
  }, [navigate]);

  // ── Submit handlers ─────────────────────────────────────────────────────────

  const buildIntents = (): string[] => {
    const intents: string[] = [];
    if (wantDownload) intents.push(downloadType === 'video' ? 'download_video' : 'download_audio');
    if (wantTab)      intents.push('generate_tab');
    // Fallback: se nada selecionado, gera tab por padrão
    return intents.length > 0 ? intents : ['generate_tab'];
  };

  const handleUrlSubmit = useCallback(async () => {
    if (!youtubeUrl.trim()) { setError('Cole uma URL válida.'); return; }
    if (inputMode === 'url' && !youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
      setError('URL inválida — use um link do YouTube nesta aba.'); return;
    }
    if (inputMode === 'other' && !youtubeUrl.startsWith('http')) {
      setError('URL inválida — deve começar com http:// ou https://.'); return;
    }
    if (!wantDownload && !wantTab) { setError('Selecione pelo menos uma ação.'); return; }
    setError(null); setPhase('processing');
    try {
      const res = await fetch('/api/process-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          intents: buildIntents(),
          audioQuality,
          videoQuality,
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(msg);
      }
      const { jobId } = await res.json();
      connectSse(jobId);
    } catch (e) { setError(`Falha: ${e}`); setPhase('idle'); }
  }, [youtubeUrl, inputMode, wantDownload, wantTab, downloadType, audioQuality, videoQuality, connectSse]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(mp3|wav|flac|ogg|m4a)$/i)) {
      setError('Formato não suportado. Use .mp3, .wav, .flac, .ogg ou .m4a'); return;
    }
    setError(null); setPhase('uploading');
    try {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error(res.statusText);
      const { jobId } = await res.json();
      setPhase('processing');
      connectSse(jobId);
    } catch (e) { setError(`Falha: ${e}`); setPhase('idle'); }
  }, [connectSse]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const isDone = steps.some(s => s.stage === 'done');

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
          <span className={styles.navLogoIcon}>⬇</span>
          <span>MediaFlow</span>
        </Link>
        <div className={styles.navLinks}>
          <Link to="/"        className={styles.navLink}>Início</Link>
          <Link to="/library" className={styles.navLink}>Biblioteca</Link>
          <Link to="/upload"  className={`${styles.navLink} ${styles.navActive}`}>Download</Link>
        </div>
      </nav>

      <main className={styles.main}>

        {/* ── IDLE / UPLOADING ───────────────────────────────────────────────── */}
        {(phase === 'idle' || phase === 'uploading') && (
          <div className={styles.shell}>

            {/* Page title */}
            <div className={styles.pageHead}>
              <h1 className={styles.pageTitle}>Baixar mídia</h1>
              <p className={styles.pageSub}>YouTube, áudio ou vídeo — rápido e sem complicação</p>
            </div>

            {/* ── SOURCE CARD ─────────────────────────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardLabel}>Fonte</div>

              {/* Tab toggle */}
              <div className={styles.tabs}>
                <button
                  id="tab-url"
                  className={`${styles.tabBtn} ${inputMode === 'url' ? styles.tabBtnActive : ''}`}
                  onClick={() => { setInputMode('url'); setYoutubeUrl(''); setError(null); }}
                >
                  <span>▶️</span> YouTube
                </button>
                <button
                  id="tab-other"
                  className={`${styles.tabBtn} ${inputMode === 'other' ? styles.tabBtnActive : ''}`}
                  onClick={() => { setInputMode('other'); setYoutubeUrl(''); setError(null); }}
                >
                  <span>🌐</span> Link externo
                </button>
                <button
                  id="tab-file"
                  className={`${styles.tabBtn} ${inputMode === 'file' ? styles.tabBtnActive : ''}`}
                  onClick={() => { setInputMode('file'); setYoutubeUrl(''); setError(null); }}
                >
                  <span>📁</span> Arquivo local
                </button>
              </div>

              {inputMode === 'url' && (
                <div className={styles.urlWrap}>
                  <div className={`${styles.urlBox} ${youtubeUrl ? styles.urlBoxActive : ''}`}>
                    <span className={styles.ytDot} />
                    <input
                      id="youtube-url-input"
                      type="url"
                      className={styles.urlInput}
                      placeholder="https://youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={e => setYoutubeUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
                      autoComplete="off"
                    />
                    {youtubeUrl && (
                      <button className={styles.clearBtn} onClick={() => setYoutubeUrl('')} title="Limpar">✕</button>
                    )}
                  </div>
                  <p className={styles.urlHint}>Cola qualquer link do YouTube — vídeo, short ou playlist.</p>

                  {/* Banner de playlist detectada */}
                  {isPlaylistUrl && (
                    <div className={styles.playlistBanner}>
                      <span>📋</span>
                      <div className={styles.playlistBannerText}>
                        <strong>Playlist detectada!</strong>
                        <span>Baixe todos os vídeos de uma vez</span>
                      </div>
                      <button
                        id="load-playlist-btn"
                        className={styles.playlistLoadBtn}
                        onClick={loadPlaylistInfo}
                        disabled={loadingPlaylist}
                      >
                        {loadingPlaylist ? <span className={styles.miniSpinnerDark} /> : null}
                        {loadingPlaylist ? 'Carregando…' : playlistEntries ? `${playlistEntries.length} vídeos` : 'Ver playlist'}
                      </button>
                    </div>
                  )}

                  {/* Preview da playlist */}
                  {playlistEntries && playlistEntries.length > 0 && (
                    <div className={styles.playlistPreview}>
                      <div className={styles.playlistPreviewHead}>
                        <span>📋 {playlistEntries.length} vídeos na playlist</span>
                      </div>
                      <ul className={styles.playlistList}>
                        {playlistEntries.slice(0, 8).map((e, i) => (
                          <li key={e.id} className={styles.playlistItem}>
                            <span className={styles.playlistIdx}>{i + 1}</span>
                            <span className={styles.playlistTitle}>{e.title}</span>
                            {e.duration && <span className={styles.playlistDur}>{fmtDuration(e.duration)}</span>}
                          </li>
                        ))}
                        {playlistEntries.length > 8 && (
                          <li className={styles.playlistMore}>+{playlistEntries.length - 8} mais…</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Third-party URL input */}
              {inputMode === 'other' && (
                <div className={styles.urlWrap}>
                  <div className={`${styles.urlBox} ${youtubeUrl ? styles.urlBoxActive : ''}`}>
                    <span className={styles.otherDot} />
                    <input
                      id="other-url-input"
                      type="url"
                      className={styles.urlInput}
                      placeholder="https://vimeo.com/... , tiktok.com/... , soundcloud.com/..."
                      value={youtubeUrl}
                      onChange={e => setYoutubeUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
                      autoComplete="off"
                    />
                    {youtubeUrl && (
                      <button className={styles.clearBtn} onClick={() => setYoutubeUrl('')} title="Limpar">✕</button>
                    )}
                  </div>
                  <div className={styles.otherWarning}>
                    <span>⚠️</span>
                    <p>Suporte experimental via <strong>yt-dlp</strong> (+1800 sites). Pode funcionar ou não dependendo do site — sem garantias!</p>
                  </div>
                </div>
              )}

              {/* Dropzone */}
              {inputMode === 'file' && (
                <div
                  className={`${styles.dropzone} ${dragging ? styles.dzActive : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                >
                  <input ref={fileInputRef} type="file" accept=".mp3,.wav,.flac,.ogg,.m4a" className={styles.hidden}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  <span className={styles.dzIcon}>{dragging ? '⬇️' : '🎵'}</span>
                  <p className={styles.dzTitle}>{dragging ? 'Solte aqui!' : 'Arraste seu arquivo'}</p>
                  <p className={styles.dzSub}>ou <span className={styles.dzLink}>clique para selecionar</span></p>
                  <div className={styles.dzBadges}>
                    {['.mp3', '.wav', '.flac', '.ogg', '.m4a'].map(f => (
                      <span key={f} className={styles.badge}>{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {phase === 'uploading' && (
                <div className={styles.uploadingRow}>
                  <span className={styles.miniSpinner} />
                  <span>Enviando arquivo…</span>
                </div>
              )}
            </div>

            {/* ── MODE CARD ───────────────────────────────────────────────── */}
            <div className={styles.card}>
              <div className={styles.cardLabel}>O que fazer <span className={styles.cardLabelHint}>— escolha um ou os dois</span></div>

              <div className={styles.modeRow}>
                <button
                  id="mode-download"
                  className={`${styles.modeBtn} ${wantDownload ? styles.modeBtnActive : ''}`}
                  onClick={() => setWantDownload(v => !v)}
                >
                  <span className={styles.modeBtnIcon}>⬇</span>
                  <div>
                    <p className={styles.modeBtnTitle}>Baixar mídia</p>
                    <p className={styles.modeBtnDesc}>Salva o arquivo no seu dispositivo</p>
                  </div>
                  <div className={styles.modePip} />
                </button>

                <button
                  id="mode-tab"
                  className={`${styles.modeBtn} ${wantTab ? styles.modeBtnActive : ''}`}
                  onClick={() => setWantTab(v => !v)}
                >
                  <span className={styles.modeBtnIcon}>🎸</span>
                  <div>
                    <p className={styles.modeBtnTitle}>Gerar Tablatura</p>
                    <p className={styles.modeBtnDesc}>IA transcreve o baixo para tab interativa</p>
                  </div>
                  <div className={styles.modePip} />
                </button>
              </div>

              {/* Badge combinado */}
              {wantDownload && wantTab && (
                <div className={styles.comboBadge}>
                  ✨ Modo completo — vai baixar <strong>e</strong> gerar a tablatura
                </div>
              )}
            </div>

            {/* ── QUALITY CARD ────────────────────────────────────────────── */}
            {wantDownload && (
              <div className={styles.card}>
                <div className={styles.cardLabel}>Qualidade do download</div>

                {/* Tipo: áudio ou vídeo */}
                <div className={styles.typeRow}>
                  <button
                    id="type-audio"
                    className={`${styles.typeChip} ${downloadType === 'audio' ? styles.typeChipActive : ''}`}
                    onClick={() => setDownloadType('audio')}
                  >
                    🎵 MP3
                  </button>
                  <button
                    id="type-video"
                    className={`${styles.typeChip} ${downloadType === 'video' ? styles.typeChipActive : ''}`}
                    onClick={() => setDownloadType('video')}
                  >
                    🎬 MP4
                  </button>
                </div>

                {/* Qualidade de áudio */}
                {downloadType === 'audio' && (
                  <div className={styles.qualityGrid}>
                    {([
                      { v: '128', label: '128 kbps', tag: 'Econômico' },
                      { v: '192', label: '192 kbps', tag: 'Recomendado' },
                      { v: '320', label: '320 kbps', tag: 'Alta fidelidade' },
                    ] as { v: AudioQuality; label: string; tag: string }[]).map(({ v, label, tag }) => (
                      <button
                        key={v}
                        id={`audio-q-${v}`}
                        className={`${styles.qualityCard} ${audioQuality === v ? styles.qualityCardActive : ''}`}
                        onClick={() => setAudioQuality(v)}
                      >
                        <span className={styles.qualityLabel}>{label}</span>
                        <span className={styles.qualityTag}>{tag}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Qualidade de vídeo */}
                {downloadType === 'video' && (
                  <div className={styles.qualityGrid}>
                    {([
                      { v: '720',  label: '720p',         tag: 'HD' },
                      { v: '1080', label: '1080p',        tag: 'Full HD' },
                      { v: 'best', label: 'Melhor disp.', tag: '4K / 2K' },
                    ] as { v: VideoQuality; label: string; tag: string }[]).map(({ v, label, tag }) => (
                      <button
                        key={v}
                        id={`video-q-${v}`}
                        className={`${styles.qualityCard} ${videoQuality === v ? styles.qualityCardActive : ''}`}
                        onClick={() => setVideoQuality(v)}
                      >
                        <span className={styles.qualityLabel}>{label}</span>
                        <span className={styles.qualityTag}>{tag}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {wantTab && (
              <div className={styles.tabInfoCard}>
                <span>🤖</span>
                <p>O áudio será separado pelo <strong>Demucs</strong> e transcrito pelo <strong>Basic Pitch</strong>.
                   Processo demora entre 2–8 min dependendo do hardware.</p>
              </div>
            )}

            {error && <p className={styles.errorMsg}>⚠️ {error}</p>}

            {/* CTA */}
            <button
              id="submit-btn"
              className={styles.cta}
              onClick={
                inputMode === 'file'
                  ? () => fileInputRef.current?.click()
                  : playlistEntries && playlistEntries.length > 0
                    ? handlePlaylistSubmit
                    : handleUrlSubmit
              }
              disabled={((inputMode === 'url' || inputMode === 'other') && !youtubeUrl.trim()) || phase === 'uploading' || (!wantDownload && !wantTab)}
            >
              {playlistEntries && playlistEntries.length > 0
                ? wantDownload && wantTab
                  ? '⬇🎸  Baixar Playlist + Tabs'
                  : wantDownload
                    ? '⬇  Baixar Playlist'
                    : '🎸  Gerar Tabs da Playlist'
                : wantDownload && wantTab
                  ? (downloadType === 'video' ? '⬇🎸  Baixar vídeo + Tablatura' : '⬇🎸  Baixar MP3 + Tablatura')
                  : wantDownload
                    ? (downloadType === 'video' ? '⬇  Baixar vídeo' : '⬇  Baixar áudio')
                    : '🎸  Gerar tablatura'}
            </button>
          </div>
        )}

        {/* ── PROCESSING ─────────────────────────────────────────────────────── */}
        {phase === 'processing' && (
          <div className={styles.processingWrap}>
            <div className={styles.processingCard}>

              {/* Pulse icon */}
              <div className={styles.procTop}>
                <div className={styles.pulseRing} />
                <span className={styles.procEmoji}>
                  {isDone ? '✅' : (wantDownload && wantTab) ? '⚡' : wantDownload ? '⬇️' : '🎸'}
                </span>
              </div>

              <h2 className={styles.procTitle}>
                {isDone ? 'Concluído!'
                  : (wantDownload && wantTab) ? 'Baixando e processando…'
                  : wantDownload ? 'Baixando…'
                  : 'Processando…'}
              </h2>

              {/* Progress bar */}
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${progress}%` }} />
              </div>
              <div className={styles.barMeta}>
                <span className={styles.barPct}>{progress}%</span>
              </div>

              {/* Done redirect hint */}
              {isDone && (
                <p className={styles.procHint}>Redirecionando para a Biblioteca em breve…</p>
              )}

              {/* Download card */}
              {downloadUrl && (
                <div className={styles.downloadCard}>
                  <div className={styles.downloadCardIcon}>💾</div>
                  <div className={styles.downloadCardBody}>
                    <p className={styles.downloadCardTitle}>Arquivo pronto!</p>
                    <p className={styles.downloadCardSub}>Clique para salvar no seu dispositivo.</p>
                  </div>
                  <a
                    id="save-to-device-btn"
                    href={downloadUrl}
                    download
                    className={styles.downloadCardBtn}
                  >
                    ⬇ Baixar
                  </a>
                </div>
              )}

              <button className={styles.cancelBtn} onClick={reset}>✕ Cancelar</button>
            </div>
          </div>
        )}
        {/* ── BATCH PROCESSING (playlist) ──────────────────────────────────── */}
        {phase === 'batch' && (
          <div className={styles.batchWrap}>
            <div className={styles.batchHeader}>
              <span>📋</span>
              <div>
                <h2 className={styles.batchTitle}>Baixando playlist</h2>
                <p className={styles.batchSub}>
                  {Object.values(batchJobs).filter(j => j.status === 'done').length} / {Object.keys(batchJobs).length} concluídos
                </p>
              </div>
              <button className={styles.cancelBtn} onClick={reset}>✕</button>
            </div>

            <ul className={styles.batchList}>
              {Object.values(batchJobs).map(job => (
                <li key={job.jobId} className={`${styles.batchItem} ${styles[`batchItem_${job.status}`]}`}>
                  <span className={styles.batchIcon}>
                    {job.status === 'done'    ? '✅'
                     : job.status === 'error' ? '❌'
                     : job.status === 'running' ? <span className={styles.miniSpinner} />
                     : '⏳'}
                  </span>
                  <div className={styles.batchItemBody}>
                    <p className={styles.batchItemTitle}>{job.title}</p>
                    {job.status === 'running' && (
                      <>
                        <div className={styles.batchBarTrack}>
                          <div className={styles.batchBarFill} style={{ width: `${job.progress}%` }} />
                        </div>
                        <p className={styles.batchItemMsg}>{job.message}</p>
                      </>
                    )}
                    {job.status === 'error' && <p className={styles.batchItemError}>{job.message}</p>}
                  </div>
                  {job.downloadUrl && job.status === 'done' && (
                    <a href={job.downloadUrl} download className={styles.batchDownBtn}>⬇</a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
