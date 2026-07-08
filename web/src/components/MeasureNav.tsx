import React from 'react';
import type { JsonMeasure } from '../types/TabJson';
import styles from './MeasureNav.module.css';

interface Props {
  measures: JsonMeasure[];
  activeMeasure: number;
  onSelect: (measureNumber: number) => void;
}

export function MeasureNav({ measures, activeMeasure, onSelect }: Props) {
  return (
    <nav className={styles.nav} aria-label="Navegação por Compassos">
      <div className={styles.header}>
        <span className={styles.title}>Compassos</span>
        <span className={styles.count}>{measures.length} total</span>
      </div>
      <div className={styles.grid}>
        {measures.map((m) => {
          const noteCount = m.events.filter((e) => e.type === 'note').length;
          const restCount = m.events.filter((e) => e.type === 'rest').length;
          const isActive = m.measureNumber === activeMeasure;
          const density = Math.min(noteCount / 12, 1); // normalised 0–1

          return (
            <button
              key={m.measureNumber}
              className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}
              onClick={() => onSelect(m.measureNumber)}
              title={`Compasso ${m.measureNumber} — ${noteCount} notas, ${restCount} pausas`}
              aria-pressed={isActive}
            >
              <span className={styles.chipNum}>{m.measureNumber}</span>
              <span
                className={styles.chipBar}
                style={{ '--density': density } as React.CSSProperties}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
