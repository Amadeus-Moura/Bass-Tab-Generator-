import React from 'react';
import type { TabMeta } from '../types/TabJson';
import styles from './InfoPanel.module.css';

interface Props {
  meta: TabMeta;
  currentMeasure: number;
}

const TUNING_LABELS: Record<string, string> = {
  EADG: '4 cordas — EADG Standard',
  BEADG: '5 cordas — BEADG Standard',
};

export function InfoPanel({ meta, currentMeasure }: Props) {
  const tuningLabel = TUNING_LABELS[meta.tuning] ?? meta.tuning;

  return (
    <aside className={styles.panel}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🎸</span>
        <div>
          <h1 className={styles.appTitle}>Bass Tab</h1>
          <p className={styles.appSub}>Gerador de Tablatura</p>
        </div>
      </div>

      <div className={styles.stats}>
        <Stat label="BPM" value={meta.bpm.toFixed(0)} accent />
        <Stat label="Compasso" value={`${currentMeasure} / ${meta.totalMeasures}`} />
        <Stat label="Notas" value={meta.totalNotes.toLocaleString('pt-BR')} />
        <Stat label="Afinação" value={tuningLabel} wide />
        <Stat label="Trastes" value={`${meta.fretCount} trastes`} />
        <Stat label="Cordas" value={`${meta.stringCount} cordas`} />
      </div>

      <div className={styles.legend}>
        <h3 className={styles.legendTitle}>Legenda</h3>
        <div className={styles.legendItem}>
          <span className={styles.dotNote} />
          <span>Nota tocada</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.dotRest} />
          <span>Pausa / silêncio</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.dotActive} />
          <span>Compasso ativo</span>
        </div>
      </div>

      <div className={styles.footer}>
        <p>Powered by</p>
        <p className={styles.footerTech}>Basic Pitch · Demucs · AlphaTab</p>
      </div>
    </aside>
  );
}

function Stat({
  label,
  value,
  accent = false,
  wide = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`${styles.stat} ${accent ? styles.statAccent : ''} ${wide ? styles.statWide : ''}`}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}
