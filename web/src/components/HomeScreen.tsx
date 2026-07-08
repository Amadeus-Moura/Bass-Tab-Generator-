import React, { useState } from 'react';
import { UploadScreen }  from './UploadScreen';
import { LibraryScreen } from './LibraryScreen';
import styles from './HomeScreen.module.css';

interface Props {
  onUploaded:    (jobId: string, audioUrl: string) => void;
  onPlayerReady: (tabJson: unknown) => void;
}

export function HomeScreen({ onUploaded, onPlayerReady }: Props) {
  const [tab, setTab] = useState<'upload' | 'library'>('upload');

  const handleUploaded = (jobId: string, audioUrl: string) => {
    onUploaded(jobId, audioUrl);
  };

  return (
    <div className={styles.root}>
      {/* Ambient orbs */}
      <div className={styles.orb1} /><div className={styles.orb2} />

      <div className={styles.shell}>
        {/* Logo */}
        <div className={styles.header}>
          <span className={styles.logo}>🎸</span>
          <h1 className={styles.title}>Bass Tab Generator</h1>
          <p className={styles.sub}>Transcrição de baixo por inteligência artificial</p>
        </div>

        {/* Tab switcher */}
        <div className={styles.tabBar} role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'upload'}
            className={`${styles.tabBtn} ${tab === 'upload' ? styles.tabActive : ''}`}
            onClick={() => setTab('upload')}
          >
            ⬆ Upload
          </button>
          <button
            role="tab"
            aria-selected={tab === 'library'}
            className={`${styles.tabBtn} ${tab === 'library' ? styles.tabActive : ''}`}
            onClick={() => setTab('library')}
          >
            🎵 Biblioteca
          </button>
        </div>

        {/* Panel */}
        <div className={styles.panel}>
          {tab === 'upload'
            ? <UploadScreen onUploaded={handleUploaded} />
            : <LibraryScreen onLoad={onPlayerReady} />
          }
        </div>
      </div>
    </div>
  );
}
