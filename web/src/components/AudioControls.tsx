import React, { useEffect, useRef, useState } from 'react';
import styles from './AudioControls.module.css';

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  title:    string;
}

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/**
 * AudioControls — the scrubber value and time display are updated directly via
 * DOM refs inside a requestAnimationFrame loop.  Only play/pause triggers a
 * React re-render (which is rare — once per user interaction).
 */
export function AudioControls({ audioRef, title }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration,  setDuration]  = useState(0);

  // DOM refs — updated by rAF, never by setState
  const scrubberRef    = useRef<HTMLInputElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const rafId          = useRef<number>(0);

  // ── Sync play/pause state & duration (rare events — setState is fine) ──────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay    = () => setIsPlaying(true);
    const onPause   = () => setIsPlaying(false);
    const onEnded   = () => setIsPlaying(false);
    const onMeta    = () => setDuration(audio.duration || 0);

    audio.addEventListener('play',            onPlay);
    audio.addEventListener('pause',           onPause);
    audio.addEventListener('ended',           onEnded);
    audio.addEventListener('loadedmetadata',  onMeta);
    audio.addEventListener('durationchange',  onMeta);

    return () => {
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.removeEventListener('ended',          onEnded);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
    };
  }, [audioRef]);

  // ── rAF loop — updates scrubber + time display without any re-render ────────
  useEffect(() => {
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        const t = audio.currentTime;
        const d = audio.duration || 0;

        // Update scrubber position directly
        if (scrubberRef.current) {
          scrubberRef.current.value = String(t);
          // Update the CSS gradient fill trick
          const pct = d > 0 ? (t / d) * 100 : 0;
          scrubberRef.current.style.setProperty('--pct', `${pct}%`);
        }

        // Update time display text node directly
        if (currentTimeRef.current) {
          currentTimeRef.current.textContent = fmt(t);
        }
      }
      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [audioRef]);

  // ── Scrubber interaction ─────────────────────────────────────────────────────
  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else              audio.pause();
  };

  return (
    <div className={styles.bar}>
      <span className={styles.title} title={title}>{title}</span>

      <button
        className={styles.playBtn}
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
        id="play-pause-btn"
      >
        {isPlaying
          ? <span className={styles.pauseIcon}>⏸</span>
          : <span className={styles.playIcon}>▶</span>}
      </button>

      {/* Current time — updated via ref.textContent in rAF */}
      <span ref={currentTimeRef} className={styles.time}>0:00</span>

      {/* Uncontrolled range input — value driven by rAF, not React state */}
      <input
        ref={scrubberRef}
        id="audio-scrubber"
        type="range"
        min={0}
        max={duration}
        step={0.05}
        defaultValue={0}
        className={styles.scrubber}
        onChange={handleScrub}
        aria-label="Posição de reprodução"
      />

      <span className={styles.time}>{fmt(duration)}</span>
    </div>
  );
}
