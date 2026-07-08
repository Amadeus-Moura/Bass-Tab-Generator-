import { useEffect, useRef, useState } from 'react';
import styles from './LoadingScreen.module.css';

interface ProgressEvent {
  stage: string;
  message: string;
  progress: number;
  tabJson?: unknown;
}

interface Props {
  jobId:   string;   // UUID do processing_job no banco
  onDone:  (tabJson: unknown) => void;
  onError: (msg: string) => void;
}

const ICONS: Record<string, string> = {
  start: '🚀', separating: '🎛️', demucs: '⚙️',
  transcribing: '🎵', transcribed: '📝', midi_done: '💾',
  mapping: '🎸', saving: '🗄️', grouping: '📊', done: '✅', error: '❌',
};

export function LoadingScreen({ jobId, onDone, onError }: Props) {
  const [steps,      setSteps]      = useState<ProgressEvent[]>([]);
  const [progress,   setProgress]   = useState(0);
  const [currentMsg, setCurrentMsg] = useState('Conectando ao servidor…');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/process/${encodeURIComponent(jobId)}`);

    es.onmessage = (e) => {
      const data: ProgressEvent = JSON.parse(e.data);
      setCurrentMsg(data.message);
      setProgress(data.progress ?? 0);
      setSteps((prev) => [...prev, data]);
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      }, 50);

      if (data.stage === 'done')  { es.close(); onDone(data.tabJson); }
      if (data.stage === 'error') { es.close(); onError(data.message); }
    };

    es.onerror = () => {
      es.close();
      onError('Conexão com o servidor perdida. Certifique-se de que `npm run server` está rodando.');
    };

    return () => es.close();
  }, [jobId, onDone, onError]);

  return (
    <div className={styles.root}>
      <div className={styles.orb1} /><div className={styles.orb2} />
      <div className={styles.card}>
        <div className={styles.icon}>🎸</div>
        <h2 className={styles.title}>Analisando o áudio…</h2>
        <p className={styles.currentMsg}>{currentMsg}</p>
        <div className={styles.barTrack}>
          <div className={styles.barFill} style={{ width: `${progress}%` }} />
          <span className={styles.barLabel}>{progress}%</span>
        </div>
        <div className={styles.log} ref={logRef}>
          {steps.map((s, i) => (
            <div key={i} className={`${styles.logItem} ${i === steps.length - 1 ? styles.logItemActive : ''}`}>
              <span className={styles.logIcon}>{ICONS[s.stage] ?? '•'}</span>
              <span>{s.message}</span>
            </div>
          ))}
        </div>
        <p className={styles.hint}>Demucs e Basic Pitch são modelos de ML — processamento pode levar 30s–2min.</p>
      </div>
    </div>
  );
}
