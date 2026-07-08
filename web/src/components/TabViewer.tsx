import React from 'react';
import type { JsonMeasure, JsonNoteEvent } from '../types/TabJson';
import styles from './TabViewer.module.css';

interface Props {
  measure: JsonMeasure;
  stringCount: number;
  tuning: string; // e.g. "EADG"
}

const STRING_COLORS = [
  '#f87171', // string 1 — red
  '#fb923c', // string 2 — orange
  '#facc15', // string 3 — yellow
  '#34d399', // string 4 — green
  '#38bdf8', // string 5 — blue (5-string bass)
];

export function TabViewer({ measure, stringCount, tuning }: Props) {
  // 'EADG'.split('') = ['E','A','D','G']
  // tuningChars[stringNumber - 1] gives the correct open-string note label:
  //   strNum 1 → index 0 → 'E',  strNum 4 → index 3 → 'G'
  const tuningChars = tuning.split('');
  const strings = Array.from({ length: stringCount }, (_, i) => i + 1);

  // Notes only (no rests)
  const noteEvents = measure.events.filter(
    (e): e is JsonNoteEvent => e.type === 'note',
  );

  // Total time span of the measure for proportional x-positioning
  const measureDuration = measure.duration;
  const measureStart = measure.startTime;

  return (
    <div className={styles.viewer}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.label}>Compasso {measure.measureNumber}</span>
        <span className={styles.sublabel}>
          {noteEvents.length} notas ·{' '}
          {measure.events.filter((e) => e.type === 'rest').length} pausas ·{' '}
          t = {measure.startTime.toFixed(2)}s
        </span>
      </div>

      {/* Fretboard grid */}
      <div className={styles.fretboard}>
        {/* String rows — displayed from highest to lowest (G on top) */}
        {[...strings].reverse().map((strNum) => {
          const stringLabel = tuningChars[strNum - 1] ?? `S${strNum}`;
          const color = STRING_COLORS[strNum - 1] ?? '#a78bfa';
          const notesOnString = noteEvents.filter((n) => n.string === strNum);

          return (
            <div key={strNum} className={styles.stringRow}>
              <span className={styles.stringLabel} style={{ color }}>
                {stringLabel}
              </span>
              <div className={styles.stringLine}>
                {/* The string line itself */}
                <div className={styles.line} style={{ borderColor: color + '40' }} />

                {/* Note events positioned proportionally */}
                {notesOnString.map((note, idx) => {
                  const relativeStart =
                    (note.startTime - measureStart) / measureDuration;
                  const relativeWidth = note.duration / measureDuration;

                  return (
                    <div
                      key={idx}
                      className={styles.noteBlock}
                      style={{
                        left: `${relativeStart * 100}%`,
                        width: `max(${relativeWidth * 100}%, 28px)`,
                        '--str-color': color,
                      } as React.CSSProperties}
                      title={`${note.pitch}${note.octave} — traste ${note.fret} (corda ${note.string})`}
                    >
                      <span className={styles.fretNum}>{note.fret}</span>
                      <span className={styles.noteLabel}>
                        {note.pitch}
                        <sub>{note.octave}</sub>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Rest markers */}
        {measure.events
          .filter((e) => e.type === 'rest')
          .map((rest, idx) => {
            const relativeStart =
              (rest.startTime - measureStart) / measureDuration;
            const relativeWidth = rest.duration / measureDuration;

            return (
              <div
                key={`rest-${idx}`}
                className={styles.restMarker}
                style={{
                  left: `${relativeStart * 100}%`,
                  width: `${relativeWidth * 100}%`,
                }}
                title={`Pausa — ${rest.duration.toFixed(3)}s`}
              />
            );
          })}
      </div>

      {/* Classic ASCII-style tab strip */}
      <div className={styles.asciiTab}>
        {[...strings].reverse().map((strNum) => {
          const stringLabel = tuningChars[strNum - 1] ?? `S${strNum}`;
          const notesOnString = noteEvents.filter((n) => n.string === strNum);
          const color = STRING_COLORS[strNum - 1] ?? '#a78bfa';

          // Build a simplified ASCII tab line
          const cells: string[] = notesOnString.map((n) =>
            n.fret.toString().padStart(2, '-'),
          );

          return (
            <div key={strNum} className={styles.asciiLine}>
              <span className={styles.asciiStringLabel} style={{ color }}>
                {stringLabel}
              </span>
              <span className={styles.asciiPipe}>|</span>
              <span className={styles.asciiFrets}>
                {cells.length > 0
                  ? cells.map((c, i) => (
                      <span key={i} className={styles.asciiCell}>
                        {c}
                      </span>
                    ))
                  : <span className={styles.asciiEmpty}>---</span>}
              </span>
              <span className={styles.asciiPipe}>|</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
