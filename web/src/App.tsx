import { useCallback, useRef, useState } from 'react';
import type { TabJson } from './types/TabJson';
import { LandingPage }  from './components/LandingPage';
import { LoadingScreen } from './components/LoadingScreen';
import { ContinuousTab } from './components/ContinuousTab';
import { AudioControls } from './components/AudioControls';
import { ModeToggle }    from './components/ModeToggle';
import styles from './App.module.css';

// ── State machine ─────────────────────────────────────────────────────────────
type Phase =
  | { name: 'landing' }
  | { name: 'loading'; jobId: string; audioUrl: string }
  | { name: 'player';  tabJson: TabJson; audioUrl: string; title: string };

export default function App() {
  const [phase,       setPhase]       = useState<Phase>({ name: 'landing' });
  const [displayMode, setDisplayMode] = useState<'frets' | 'notes'>('frets');
  const audioRef = useRef<HTMLAudioElement>(null);

  // Upload concluído → inicia pipeline SSE
  const handleUploaded = useCallback((jobId: string, audioUrl: string) => {
    setPhase({ name: 'loading', jobId, audioUrl });
  }, []);

  // Pipeline SSE finalizado → abre player
  const handleDone = useCallback((payload: unknown) => {
    setPhase((prev) => {
      if (prev.name !== 'loading') return prev;
      const title = decodeURIComponent(prev.audioUrl.split('/').pop() ?? 'Bassline');
      return { name: 'player', tabJson: payload as TabJson, audioUrl: prev.audioUrl, title };
    });
  }, []);

  // Música carregada da biblioteca → abre player diretamente
  const handleLoadSong = useCallback(
    (tabJson: TabJson, audioUrl: string, title: string) => {
      setPhase({ name: 'player', tabJson, audioUrl, title });
    },
    [],
  );

  const handleError = useCallback((msg: string) => {
    alert(`Erro no processamento:\n${msg}`);
    setPhase({ name: 'landing' });
  }, []);

  const seek = useCallback((t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t;
  }, []);

  // ── Landing ───────────────────────────────────────────────────────────────────
  if (phase.name === 'landing') {
    return <LandingPage onUploaded={handleUploaded} onLoadSong={handleLoadSong} />;
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase.name === 'loading') {
    return (
      <LoadingScreen
        jobId={phase.jobId}
        onDone={handleDone}
        onError={handleError}
      />
    );
  }

  // ── Player ────────────────────────────────────────────────────────────────────
  const { tabJson, audioUrl, title } = phase;
  const { totalNotes, totalMeasures, bpm, tuning } = tabJson.meta;

  return (
    <div className={styles.playerRoot}>
      <audio ref={audioRef} src={audioUrl} preload="auto" crossOrigin="anonymous" />

      <header className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.appLogo}>🎸</span>
          <div>
            <h1 className={styles.appName}>Bass Tab</h1>
            <p className={styles.appSub}>
              {tuning} · {bpm} BPM · {totalNotes} notas · {totalMeasures} compassos
            </p>
          </div>
        </div>

        <div className={styles.topCenter}>
          <ModeToggle mode={displayMode} onChange={setDisplayMode} />
        </div>

        <div className={styles.topRight}>
          <button
            className={styles.resetBtn}
            onClick={() => setPhase({ name: 'landing' })}
          >
            ← Início
          </button>
        </div>
      </header>

      <AudioControls audioRef={audioRef} title={title} />

      <div className={styles.tabArea}>
        <ContinuousTab
          tabJson={tabJson}
          audioRef={audioRef}
          displayMode={displayMode}
          onSeek={seek}
        />
      </div>
    </div>
  );
}
