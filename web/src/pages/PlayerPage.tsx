import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TabJson } from '../types/TabJson';
import { ContinuousTab } from '../components/ContinuousTab';
import { AudioControls } from '../components/AudioControls';
import { ModeToggle } from '../components/ModeToggle';
import { exportTabToPdf } from '../utils/exportTabToPdf';
import styles from './PlayerPage.module.css';

const ZOOM_DEFAULT = 180;
const ZOOM_MIN = 80;
const ZOOM_MAX = 500;

export function PlayerPage() {
  const { songId } = useParams<{ songId: string }>();
  const navigate = useNavigate();

  const [tabJson, setTabJson] = useState<TabJson | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'frets' | 'notes'>('frets');
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [exporting, setExporting] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!songId) { setError('ID de música inválido.'); setLoading(false); return; }
    fetch(`/api/songs/${songId}/tablature`)
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(({ tabJson: tj, audioUrl: au, title: t }) => {
        setTabJson(tj as TabJson);
        setAudioUrl(au as string);
        setTitle(t as string);
        setLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [songId]);

  const seek = useCallback((t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t;
  }, []);

  const handleExport = useCallback(async () => {
    if (!tabJson || exporting) return;
    setExporting(true);
    try {
      await exportTabToPdf(tabJson, title, zoom);
    } catch (e) {
      alert(`Erro ao gerar PDF: ${e}`);
    } finally {
      setExporting(false);
    }
  }, [tabJson, title, zoom, exporting]);

  if (loading) {
    return (
      <div className={styles.center}>
        <div className={styles.spinner} />
        <p>Carregando tablatura…</p>
      </div>
    );
  }

  if (error || !tabJson) {
    return (
      <div className={styles.center}>
        <p className={styles.errorText}>⚠️ {error ?? 'Tablatura não encontrada.'}</p>
        <button className={styles.backBtn} onClick={() => navigate('/library')}>← Voltar</button>
      </div>
    );
  }

  const { totalNotes, totalMeasures, bpm, tuning } = tabJson.meta;

  return (
    <div className={styles.root}>
      <audio ref={audioRef} src={audioUrl} preload="auto" crossOrigin="anonymous" />

      <header className={styles.topBar}>
        <div className={styles.topLeft}>
          <Link to="/library" className={styles.backLink} title="Voltar">←</Link>
          <div className={styles.titleBlock}>
            <h1 className={styles.songTitle}>{title}</h1>
            <p className={styles.songMeta}>
              {tuning} · {bpm} BPM · {totalNotes} notas · {totalMeasures} compassos
            </p>
          </div>
        </div>

        <div className={styles.topCenter}>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>

        <div className={styles.topRight}>
          {/* Zoom */}
          <div className={styles.zoomControl}>
            <span className={styles.zoomIcon}>🔍</span>
            <input
              type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={20}
              value={zoom} className={styles.zoomSlider}
              onChange={(e) => setZoom(Number(e.target.value))}
              title={`Zoom: ${zoom}px/s`}
            />
            <span className={styles.zoomLabel}>{zoom}<small>px/s</small></span>
          </div>

          {/* PDF Export */}
          <button
            className={`${styles.exportBtn} ${exporting ? styles.exportBtnBusy : ''}`}
            onClick={handleExport}
            disabled={exporting}
            title="Exportar tablatura para PDF"
          >
            {exporting ? <span className={styles.exportSpinner} /> : '⬇'} PDF
          </button>

          <Link to="/library" className={styles.navLink}>Biblioteca</Link>
          <Link to="/upload" className={styles.navCta}>⬆ Upload</Link>
        </div>
      </header>

      <AudioControls audioRef={audioRef} title={title} />

      <div className={styles.tabArea}>
        <ContinuousTab
          tabJson={tabJson}
          audioRef={audioRef}
          displayMode={mode}
          zoom={zoom}
          onSeek={seek}
        />
      </div>
    </div>
  );
}
