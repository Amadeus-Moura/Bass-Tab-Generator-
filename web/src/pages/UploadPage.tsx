import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './UploadPage.module.css';

type Phase = 'idle' | 'uploading' | 'processing';

interface SseEvent {
  stage: string;
  message: string;
  progress: number;
  tabJson?: unknown;
}

const STAGE_ICONS: Record<string, string> = {
  start: '🚀', separating: '🎛️', demucs: '⚙️',
  transcribing: '🎵', transcribed: '📝', midi_done: '💾',
  mapping: '🎸', saving: '🗄️', done: '✅', error: '❌',
};

export function UploadPage() {
  const navigate = useNavigate();
  const [phase,       setPhase]       = useState<Phase>('idle');
  const [dragging,    setDragging]    = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [steps,       setSteps]       = useState<SseEvent[]>([]);
  const [progress,    setProgress]    = useState(0);
  const [currentMsg,  setCurrentMsg]  = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef       = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(mp3|wav|flac|ogg|m4a)$/i)) {
      setError('Formato não suportado. Use .mp3, .wav, .flac, .ogg ou .m4a');
      return;
    }
    setError(null);
    setPhase('uploading');

    try {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error(res.statusText);
      const { jobId } = await res.json();

      // Start SSE
      setPhase('processing');
      const es = new EventSource(`/api/process/${encodeURIComponent(jobId)}`);

      es.onmessage = (e) => {
        const data: SseEvent = JSON.parse(e.data);
        setCurrentMsg(data.message);
        setProgress(data.progress ?? 0);
        setSteps((prev) => [...prev, data]);
        setTimeout(() => {
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        }, 50);

        if (data.stage === 'done') {
          es.close();
          // Wait 1s then redirect to library
          setTimeout(() => navigate('/library'), 1200);
        }
        if (data.stage === 'error') {
          es.close();
          setError(data.message);
          setPhase('idle');
        }
      };

      es.onerror = () => {
        es.close();
        setError('Conexão com o servidor perdida. Verifique se `npm run server` está rodando.');
        setPhase('idle');
      };
    } catch (e) {
      setError(`Falha: ${e}`);
      setPhase('idle');
    }
  }, [navigate]);

  const reset = () => {
    setPhase('idle');
    setError(null);
    setSteps([]);
    setProgress(0);
    setCurrentMsg('');
  };

  return (
    <div className={styles.root}>
      <div className={styles.bg} aria-hidden>
        <div className={styles.orb1} /><div className={styles.orb2} />
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        <Link to="/" className={styles.navLogo}>🎸 <span>Bass Tab</span></Link>
        <div className={styles.navLinks}>
          <Link to="/"        className={styles.navLink}>Início</Link>
          <Link to="/library" className={styles.navLink}>Biblioteca</Link>
          <Link to="/upload"  className={`${styles.navLink} ${styles.navLinkActive}`}>Upload</Link>
        </div>
      </nav>

      <main className={styles.main}>
        {phase === 'idle' && (
          <>
            <div className={styles.pageHeader}>
              <h1 className={styles.pageTitle}>Nova Transcrição</h1>
              <p className={styles.pageSub}>Envie um arquivo de áudio para gerar a tablatura de baixo.</p>
            </div>

            <div
              className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <input
                ref={fileInputRef} type="file" accept=".mp3,.wav,.flac,.ogg,.m4a"
                className={styles.hidden}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <span className={styles.dzIcon}>{dragging ? '⬇' : '🎵'}</span>
              <p className={styles.dzLabel}>{dragging ? 'Solte aqui!' : 'Arraste um arquivo de áudio'}</p>
              <p className={styles.dzHint}>ou clique para selecionar</p>
              <div className={styles.formats}>
                {['.mp3', '.wav', '.flac', '.ogg', '.m4a'].map((f) => (
                  <span key={f} className={styles.format}>{f}</span>
                ))}
              </div>
            </div>

            {error && <p className={styles.error}>⚠️ {error}</p>}

            <div className={styles.info}>
              <span>ℹ️</span>
              <p>O processamento usa Demucs (separação de fonte) e Basic Pitch (transcrição MIDI). Com GPU pode levar ~30s, sem GPU até 3min. Ao finalizar, você será redirecionado automaticamente para a Biblioteca.</p>
            </div>
          </>
        )}

        {phase === 'uploading' && (
          <div className={styles.center}>
            <div className={styles.spinner} />
            <p className={styles.statusMsg}>Enviando arquivo…</p>
          </div>
        )}

        {phase === 'processing' && (
          <div className={styles.processingCard}>
            <div className={styles.processingHeader}>
              <span className={styles.processingIcon}>🎸</span>
              <div>
                <h2 className={styles.processingTitle}>Analisando o áudio…</h2>
                <p className={styles.processingMsg}>{currentMsg}</p>
              </div>
            </div>

            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${progress}%` }} />
            </div>
            <p className={styles.barLabel}>{progress}%</p>

            <div className={styles.log} ref={logRef}>
              {steps.map((s, i) => (
                <div key={i} className={`${styles.logItem} ${i === steps.length - 1 ? styles.logItemActive : ''}`}>
                  <span>{STAGE_ICONS[s.stage] ?? '•'}</span>
                  <span>{s.message}</span>
                </div>
              ))}
            </div>

            <p className={styles.redirectHint}>
              {steps.some((s) => s.stage === 'done')
                ? '✅ Concluído! Redirecionando para a Biblioteca…'
                : 'Demucs e Basic Pitch são modelos de ML — pode levar até 2 min.'}
            </p>

            <button className={styles.cancelBtn} onClick={reset}>✕ Cancelar</button>
          </div>
        )}
      </main>
    </div>
  );
}
