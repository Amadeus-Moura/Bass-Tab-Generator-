import React, { useCallback, useRef, useState } from 'react';
import type { TabJson } from './types/TabJson';
import { HomeScreen }    from './components/HomeScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { ContinuousTab } from './components/ContinuousTab';
import { AudioControls } from './components/AudioControls';
import { ModeToggle }    from './components/ModeToggle';
import styles from './App.module.css';

// ── State machine ─────────────────────────────────────────────────────────────
type Phase =
  | { name: 'home' }
  | { name: 'loading'; jobId: string; audioUrl: string }
  | { name: 'player'; tabJson: TabJson; audioUrl: string; title: string };

export default function App() {
  const [phase,       setPhase]       = useState<Phase>({ name: 'home' });
  const [displayMode, setDisplayMode] = useState<'frets' | 'notes'>('frets');
  const audioRef = useRef<HTMLAudioElement>(null);

  // Called by UploadScreen after file is uploaded — start processing
  const handleUploaded = useCallback((jobId: string, audioUrl: string) => {
    setPhase({ name: 'loading', jobId, audioUrl });
  }, []);

  // Called by LoadingScreen SSE when pipeline finishes (returns raw tabJson)
  const handleDone = useCallback((payload: unknown) => {
    setPhase((prev) => {
      // From LoadingScreen: payload is the tabJson directly
      if (prev.name === 'loading') {
        const title = decodeURIComponent(prev.audioUrl.split('/').pop() ?? 'Bassline');
        return { name: 'player', tabJson: payload as TabJson, audioUrl: prev.audioUrl, title };
      }
      return prev;
    });
  }, []);

  // Called by LibraryScreen: payload is { tabJson, audioUrl, title }
  const handleLibraryLoad = useCallback((payload: unknown) => {
    const { tabJson, audioUrl, title } = payload as { tabJson: TabJson; audioUrl: string; title: string };
    setPhase({ name: 'player', tabJson, audioUrl, title });
  }, []);

  const handleError = useCallback((msg: string) => {
    alert(`Erro: ${msg}`);
    setPhase({ name: 'home' });
  }, []);

  const seek = useCallback((t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (phase.name === 'home') {
    return (
      <HomeScreen
        onUploaded={handleUploaded}
        onPlayerReady={handleLibraryLoad}
      />
    );
  }

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
          <button className={styles.resetBtn} onClick={() => setPhase({ name: 'home' })}>
            ↩ Biblioteca
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
