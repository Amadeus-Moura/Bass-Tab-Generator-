import React from 'react';
import styles from './ModeToggle.module.css';

interface Props {
  mode: 'frets' | 'notes';
  onChange: (mode: 'frets' | 'notes') => void;
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className={styles.toggle} role="group" aria-label="Modo de exibição">
      <button
        className={`${styles.btn} ${mode === 'frets' ? styles.active : ''}`}
        onClick={() => onChange('frets')}
        aria-pressed={mode === 'frets'}
      >
        <span className={styles.icon}>🎸</span>
        <span>Trastes</span>
      </button>
      <button
        className={`${styles.btn} ${mode === 'notes' ? styles.active : ''}`}
        onClick={() => onChange('notes')}
        aria-pressed={mode === 'notes'}
      >
        <span className={styles.icon}>🎵</span>
        <span>Notas</span>
      </button>
    </div>
  );
}
