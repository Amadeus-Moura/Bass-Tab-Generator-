import React, { useEffect, useMemo, useRef } from 'react';
import type { TabJson, JsonNoteEvent } from '../types/TabJson';
import styles from './ContinuousTab.module.css';

// ── Layout constants ──────────────────────────────────────────────────────────
const RULER_H       = 28;   // time ruler height (px)
const STRING_HEIGHT = 80;   // height per string row (px)
const NOTE_HEIGHT   = 46;   // note block height
const NOTE_MIN_W    = 34;   // minimum note width
const SCROLL_OFFSET = 0.30; // playhead sits at 30% of container width

// ── Per-string palette — max contrast between 4 strings ───────────────────
const STRING_COLORS = [
  '#f87171',  // string 1  E  → coral red
  '#fb923c',  // string 2  A  → orange
  '#38bdf8',  // string 3  D  → sky blue
  '#a78bfa',  // string 4  G  → violet
];
const STRING_DIM = [
  'rgba(248,113,113,0.15)',
  'rgba(251,146,60,0.15)',
  'rgba(56,189,248,0.15)',
  'rgba(167,139,250,0.15)',
];
const TUNING = ['E', 'A', 'D', 'G'];

interface Props {
  tabJson:      TabJson;
  audioRef:     React.RefObject<HTMLAudioElement | null>;
  displayMode:  'frets' | 'notes';
  zoom:         number;   // px per second — controlled by parent
  onSeek:       (t: number) => void;
}

export function ContinuousTab({ tabJson, audioRef, displayMode, zoom, onSeek }: Props) {
  const PX_PER_SECOND = zoom;

  // ── DOM refs (no setState in hot-path) ────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef  = useRef<HTMLDivElement>(null);
  const noteRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const activeSet    = useRef<Set<number>>(new Set());
  const rafId        = useRef<number>(0);

  // ── Flatten all note events once ──────────────────────────────────────────
  const allNotes: JsonNoteEvent[] = useMemo(
    () =>
      tabJson.measures.flatMap((m) =>
        m.events.filter((e): e is JsonNoteEvent => e.type === 'note'),
      ),
    [tabJson],
  );

  // ── Timeline dimensions ───────────────────────────────────────────────────
  const totalDuration = useMemo(() => {
    let max = 0;
    for (const n of allNotes) max = Math.max(max, n.startTime + n.duration);
    return Math.max(max, 1);
  }, [allNotes]);

  const totalWidth   = totalDuration * PX_PER_SECOND;
  const stringsH     = tabJson.meta.stringCount * STRING_HEIGHT;
  const canvasH      = RULER_H + stringsH; // ruler on top, strings below

  // ── String y positions (offset by ruler) ─────────────────────────────────
  const stringY     = (s: number) =>
    RULER_H + (tabJson.meta.stringCount - s) * STRING_HEIGHT + (STRING_HEIGHT - NOTE_HEIGHT) / 2;
  const stringLineY = (s: number) =>
    RULER_H + (tabJson.meta.stringCount - s) * STRING_HEIGHT + STRING_HEIGHT / 2;

  // ── rAF loop — 60fps, zero setState ──────────────────────────────────────
  useEffect(() => {
    const activeClass = styles.noteActive;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio) { rafId.current = requestAnimationFrame(tick); return; }

      const t = audio.currentTime;
      const x = t * PX_PER_SECOND;

      // 1. Move playhead
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${x}px)`;
      }

      // 2. Auto-scroll
      const container = containerRef.current;
      if (container) {
        const target = x - container.clientWidth * SCROLL_OFFSET;
        container.scrollLeft = Math.max(0, target);
      }

      // 3. Highlight active notes O(k)
      const prev = activeSet.current;
      const next = new Set<number>();
      for (let i = 0; i < allNotes.length; i++) {
        const n = allNotes[i];
        if (n.startTime > t + 0.05) break;
        if (t >= n.startTime && t < n.startTime + n.duration) next.add(i);
      }
      prev.forEach((i) => { if (!next.has(i)) noteRefs.current[i]?.classList.remove(activeClass); });
      next.forEach((i) => { if (!prev.has(i)) noteRefs.current[i]?.classList.add(activeClass); });
      activeSet.current = next;

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [audioRef, allNotes, PX_PER_SECOND]);

  // ── Click-to-seek ─────────────────────────────────────────────────────────
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x    = e.clientX - rect.left + container.scrollLeft;
    // Only seek if click is below the ruler
    if (e.clientY - rect.top < RULER_H) return;
    onSeek(x / PX_PER_SECOND);
  };

  // ── Time ruler ticks ──────────────────────────────────────────────────────
  const tickSeconds = useMemo(() => {
    const count = Math.ceil(totalDuration) + 1;
    return Array.from({ length: count }, (_, i) => i);
  }, [totalDuration]);

  // ── Measure markers ───────────────────────────────────────────────────────
  const measureMarkers = useMemo(
    () => tabJson.measures.map((m) => ({ num: m.measureNumber, x: m.startTime * PX_PER_SECOND })),
    [tabJson, PX_PER_SECOND],
  );

  return (
    <div className={styles.wrapper}>
      {/* ── Fixed string labels column ──────────────────────────────── */}
      <div className={styles.labelsCol} style={{ height: canvasH }}>
        {/* Ruler spacer */}
        <div className={styles.rulerSpacer} style={{ height: RULER_H }}>
          <span className={styles.rulerUnit}>s</span>
        </div>
        {/* String labels */}
        {Array.from({ length: tabJson.meta.stringCount }, (_, i) => i + 1)
          .reverse()
          .map((s) => (
            <div
              key={s}
              className={styles.stringLabel}
              style={{ color: STRING_COLORS[s - 1], height: STRING_HEIGHT }}
            >
              <span className={styles.stringName}>{TUNING[s - 1]}</span>
              <span className={styles.stringNum}>{s}</span>
            </div>
          ))}
      </div>

      {/* ── Scrollable timeline ─────────────────────────────────────── */}
      <div className={styles.scrollContainer} ref={containerRef}>
        <div
          className={styles.inner}
          style={{ width: totalWidth, height: canvasH }}
          onClick={handleClick}
        >
          {/* ── Time ruler ──────────────────────────────────────────── */}
          <div className={styles.ruler} style={{ width: totalWidth, height: RULER_H }}>
            {tickSeconds.map((sec) => (
              <div
                key={sec}
                className={`${styles.tick} ${sec % 5 === 0 ? styles.tickMajor : ''}`}
                style={{ left: sec * PX_PER_SECOND }}
              >
                {sec % 5 === 0 && (
                  <span className={styles.tickLabel}>{sec}s</span>
                )}
              </div>
            ))}
          </div>

          {/* ── String guide lines ──────────────────────────────────── */}
          {Array.from({ length: tabJson.meta.stringCount }, (_, i) => i + 1).map((s) => (
            <div
              key={`line-${s}`}
              className={styles.stringLine}
              style={{
                top:         stringLineY(s),
                borderColor: STRING_COLORS[s - 1] + '30',
              }}
            />
          ))}

          {/* ── Measure markers ─────────────────────────────────────── */}
          {measureMarkers.map((m) => (
            <div
              key={`m-${m.num}`}
              className={styles.measureMarker}
              style={{ left: m.x, height: stringsH, top: RULER_H }}
            >
              <span className={styles.measureNum}>{m.num}</span>
            </div>
          ))}

          {/* ── Note blocks ─────────────────────────────────────────── */}
          {allNotes.map((note, idx) => {
            const w      = Math.max(note.duration * PX_PER_SECOND, NOTE_MIN_W);
            const color  = STRING_COLORS[note.string - 1];
            const dim    = STRING_DIM[note.string - 1];
            const wide   = w >= 52; // enough room for dual label

            return (
              <div
                key={idx}
                ref={(el) => { noteRefs.current[idx] = el; }}
                className={styles.note}
                style={{
                  left:        note.startTime * PX_PER_SECOND,
                  top:         stringY(note.string),
                  width:       w,
                  height:      NOTE_HEIGHT,
                  background:  dim,
                  borderColor: color + '60',
                  '--nc':      color,
                } as React.CSSProperties}
                title={`${note.pitch}${note.octave} · traste ${note.fret} · corda ${note.string}`}
              >
                {wide ? (
                  /* Dual label — fret number (big) + note name (small) */
                  <div className={styles.noteDualLabel}>
                    <span className={styles.notePrimary}>
                      {displayMode === 'frets' ? note.fret : `${note.pitch}${note.octave}`}
                    </span>
                    <span className={styles.noteSecondary}>
                      {displayMode === 'frets' ? `${note.pitch}${note.octave}` : `f${note.fret}`}
                    </span>
                  </div>
                ) : (
                  <span className={styles.noteSingle}>
                    {displayMode === 'frets' ? note.fret : note.pitch}
                  </span>
                )}
              </div>
            );
          })}

          {/* ── Playhead — GPU translateX, no layout reflow ─────────── */}
          <div
            ref={playheadRef}
            className={styles.playhead}
            style={{ height: canvasH }}
          />
        </div>
      </div>
    </div>
  );
}
