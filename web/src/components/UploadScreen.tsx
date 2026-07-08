import React, { useCallback, useRef, useState } from 'react';
import styles from './UploadScreen.module.css';

interface Props {
  onUploaded: (jobId: string, audioUrl: string) => void;
}

export function UploadScreen({ onUploaded }: Props) {
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(mp3|wav|flac|ogg|m4a)$/i)) {
      setError('Formato não suportado. Use .mp3, .wav, .flac, .ogg ou .m4a');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Upload falhou: ${res.statusText}`);
      const { jobId, audioUrl } = await res.json();
      onUploaded(jobId, audioUrl);
    } catch (e) {
      setError(String(e));
      setUploading(false);
    }
  }, [onUploaded]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className={styles.root}>
      <div
        className={`${styles.dropzone} ${dragging ? styles.dragging : ''} ${uploading ? styles.uploading : ''}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={inputRef} type="file" accept=".mp3,.wav,.flac,.ogg,.m4a"
          className={styles.hidden} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        {uploading ? (
          <div className={styles.state}><div className={styles.spinner} /><p>Enviando arquivo…</p></div>
        ) : (
          <div className={styles.state}>
            <span className={styles.dropIcon}>{dragging ? '⬇' : '🎵'}</span>
            <p className={styles.label}>{dragging ? 'Solte aqui!' : 'Arraste um arquivo de áudio'}</p>
            <p className={styles.hint}>ou clique para selecionar</p>
            <p className={styles.formats}>.mp3 · .wav · .flac · .ogg · .m4a</p>
          </div>
        )}
      </div>

      {error && <p className={styles.error}>⚠️ {error}</p>}

      <div className={styles.pipeline}>
        {['Demucs — Separação de fontes', 'Basic Pitch — Transcrição MIDI', 'Domain — Mapeamento no braço'].map((s, i) => (
          <div key={i} className={styles.step}><span className={styles.dot} /><span>{s}</span></div>
        ))}
      </div>
    </div>
  );
}
