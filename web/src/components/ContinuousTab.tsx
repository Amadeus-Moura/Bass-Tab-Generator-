import React, { useEffect, useMemo, useRef } from 'react';
import type { TabJson, JsonNoteEvent } from '../types/TabJson';
import styles from './ContinuousTab.module.css';

// ── Layout constants ──────────────────────────────────────────────────────────
const PX_PER_SECOND  = 160;
const STRING_HEIGHT  = 64;
const NOTE_HEIGHT    = 32;
const NOTE_MIN_W     = 28;
const SCROLL_OFFSET  = 0.30; // playhead sits at 30% of container width

const STRING_COLORS = ['#f87171', '#fb923c', '#facc15', '#34d399'];
const STRING_DIM    = [
  'rgba(248,113,113,0.18)',
  'rgba(251,146,60,0.18)',
  'rgba(250,204,21,0.18)',
  'rgba(52,211,153,0.18)',
];
const TUNING = ['E', 'A', 'D', 'G']; // index = stringNumber - 1

interface Props {
  tabJson:      TabJson;
  audioRef:     React.RefObject<HTMLAudioElement | null>;
  displayMode:  'frets' | 'notes';
  onSeek:       (t: number) => void;
}

export function ContinuousTab({ tabJson, audioRef, displayMode, onSeek }: Props) {
  // ── Refs for direct DOM manipulation (no setState in hot-path) ───────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef  = useRef<HTMLDivElement>(null);
  const noteRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const activeSet    = useRef<Set<number>>(new Set());
  const rafId        = useRef<number>(0);

  // ── Flatten notes once ────────────────────────────────────────────────────────
  const allNotes: JsonNoteEvent[] = useMemo(
    () =>
      tabJson.measures.flatMap((m) =>
        m.events.filter((e): e is JsonNoteEvent => e.type === 'note'),
      ),
    [tabJson],
  );

  // ── Total timeline width ──────────────────────────────────────────────────────
  const totalDuration = useMemo(() => {
    let max = 0;
    for (const n of allNotes) max = Math.max(max, n.startTime + n.duration);
    return Math.max(max, 1);
  }, [allNotes]);

  const totalWidth  = totalDuration * PX_PER_SECOND;
  const totalHeight = tabJson.meta.stringCount * STRING_HEIGHT;

  // ── rAF loop — runs at 60fps, NEVER calls setState ───────────────────────────
  useEffect(() => {
    const activeClass = styles.noteActive;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio) { rafId.current = requestAnimationFrame(tick); return; }

      const t = audio.currentTime;
      const x = t * PX_PER_SECOND;

      // 1. Move playhead (GPU-composited transform — no layout reflow)
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${x}px)`;
      }

      // 2. Auto-scroll: keep playhead at SCROLL_OFFSET% of container
      const container = containerRef.current;
      if (container) {
        const target = x - container.clientWidth * SCROLL_OFFSET;
        container.scrollLeft = Math.max(0, target);
      }

      // 3. Highlight active notes — O(k) using sorted order
      const prev = activeSet.current;
      const next = new Set<number>();

      for (let i = 0; i < allNotes.length; i++) {
        const n = allNotes[i];
        if (n.startTime > t + 0.05) break; // sorted → everything after is future
        if (t >= n.startTime && t < n.startTime + n.duration) {
          next.add(i);
        }
      }

      // Remove stale active classes
      prev.forEach((i) => {
        if (!next.has(i)) noteRefs.current[i]?.classList.remove(activeClass);
      });
      // Add new active classes
      next.forEach((i) => {
        if (!prev.has(i)) noteRefs.current[i]?.classList.add(activeClass);
      });

      activeSet.current = next;
      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [audioRef, allNotes]);

  // ── Click-to-seek ─────────────────────────────────────────────────────────────
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    // x relative to the inner timeline (scrollLeft included)
    const rect = e.currentTarget.getBoundingClientRect();
    const x    = e.clientX - rect.left + container.scrollLeft;
    onSeek(x / PX_PER_SECOND);
  };

  // ── String y-positions ────────────────────────────────────────────────────────
  const stringY     = (s: number) => (tabJson.meta.stringCount - s) * STRING_HEIGHT + (STRING_HEIGHT - NOTE_HEIGHT) / 2;
  const stringLineY = (s: number) => (tabJson.meta.stringCount - s) * STRING_HEIGHT + STRING_HEIGHT / 2;

  // ── Measure markers ───────────────────────────────────────────────────────────
  const measures = useMemo(
    () => tabJson.measures.map((m) => ({ num: m.measureNumber, x: m.startTime * PX_PER_SECOND })),
    [tabJson],
  );

  return (
    <div className={styles.wrapper}>
      {/* Fixed string labels */}
      <div className={styles.labels} style={{ height: totalHeight }}>
        {Array.from({ length: tabJson.meta.stringCount }, (_, i) => i + 1)
          .reverse()
          .map((s) => (
            <div
              key={s}
              className={styles.stringLabel}
              style={{ color: STRING_COLORS[s - 1], height: STRING_HEIGHT }}
            >
              {TUNING[s - 1]}
            </div>
          ))}
      </div>

      {/* Scrollable timeline — overflow-x:scroll but we set scrollLeft via rAF */}
      <div className={styles.scrollContainer} ref={containerRef}>
        {/* Click target fills full inner area */}
        <div
          className={styles.inner}
          style={{ width: totalWidth, height: totalHeight }}
          onClick={handleClick}
        >
          {/* String lines */}
          {Array.from({ length: tabJson.meta.stringCount }, (_, i) => i + 1).map((s) => (
            <div
              key={`line-${s}`}
              className={styles.stringLine}
              style={{ top: stringLineY(s), borderColor: STRING_COLORS[s - 1] + '28' }}
            />
          ))}

          {/* Measure markers */}
          {measures.map((m) => (
            <div key={`m-${m.num}`} className={styles.measureMarker} style={{ left: m.x }}>
              <span className={styles.measureNum}>{m.num}</span>
            </div>
          ))}

          {/* Note blocks — refs stored for rAF class toggling */}
          {allNotes.map((note, idx) => {
            const w     = Math.max(note.duration * PX_PER_SECOND, NOTE_MIN_W);
            const color = STRING_COLORS[note.string - 1];
            const dim   = STRING_DIM[note.string - 1];

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
                  borderColor: color + '55',
                  '--nc':      color,
                } as React.CSSProperties}
                title={`${note.pitch}${note.octave} · traste ${note.fret} · corda ${note.string}`}
              >
                <span className={styles.noteLabel}>
                  {displayMode === 'frets' ? note.fret : note.pitch}
                </span>
              </div>
            );
          })}

          {/* Playhead — GPU-composited via transform: translateX, starts at x=0 */}
          <div
            ref={playheadRef}
            className={styles.playhead}
            style={{ height: totalHeight }}
          />
        </div>
      </div>
    </div>
  );
}
