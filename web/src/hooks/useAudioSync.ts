/**
 * useAudioSync — minimal hook that only tracks play/pause state via React.
 *
 * currentTime is intentionally NOT tracked here.  High-frequency time
 * updates are done directly via requestAnimationFrame inside the components
 * that need them (AudioControls, ContinuousTab), writing straight to DOM refs
 * without triggering any React re-renders.
 */
import { useEffect, useRef, useState } from 'react';

export interface AudioControls {
  isPlaying: boolean;
  duration:  number;
  play:  () => void;
  pause: () => void;
  seek:  (t: number) => void;
}

export function useAudioSync(
  audioRef: React.RefObject<HTMLAudioElement | null>,
): AudioControls {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration,  setDuration]  = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onMeta  = () => setDuration(audio.duration || 0);

    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    audio.addEventListener('ended',          onEnded);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);

    return () => {
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.removeEventListener('ended',          onEnded);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
    };
  }, [audioRef]);

  const play  = () => audioRef.current?.play().catch(() => {});
  const pause = () => audioRef.current?.pause();
  const seek  = (t: number) => { if (audioRef.current) audioRef.current.currentTime = t; };

  return { isPlaying, duration, play, pause, seek };
}
