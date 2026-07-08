import React, { useEffect, useState } from 'react';
import styles from './LibraryScreen.module.css';

interface LibraryEntry {
  songId:           string;
  title:            string;
  artist:           string | null;
  originalFilename: string;
  createdAt:        string;
  bpm:              number | null;
  totalNotes:       number | null;
  totalMeasures:    number | null;
  tuning:           string | null;
  tabId:            string | null;
}

interface Props {
  /** Called with the full tabJson when user loads a song from the library */
  onLoad: (tabJson: unknown) => void;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function LibraryScreen({ onLoad }: Props) {
  const [songs,    setSongs]    = useState<LibraryEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/library')
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data) => { setSongs(data); setLoading(false); })
      .catch((e)  => { setError(String(e)); setLoading(false); });
  }, []);

  const handleLoad = async (song: LibraryEntry) => {
    if (!song.tabId) return;
    setLoadingId(song.songId);
    try {
      const res = await fetch(`/api/songs/${song.songId}/tablature`);
      if (!res.ok) throw new Error(res.statusText);
      const { tabJson, audioUrl, title } = await res.json();
      // Wrap in the same shape the player expects after processing
      onLoad({ tabJson, audioUrl, title });
    } catch (e) {
      alert(`Erro ao carregar tablatura: ${e}`);
    } finally {
      setLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.center}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Carregando biblioteca…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.center}>
        <p className={styles.errorText}>⚠️ {error}</p>
        <p className={styles.hint}>Certifique-se de que <code>npm run server</code> está rodando.</p>
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🎵</span>
        <p>Nenhuma música salva ainda.</p>
        <p className={styles.hint}>Faça o upload de um áudio para começar!</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {songs.map((song) => (
        <div key={song.songId} className={styles.card}>
          <div className={styles.cardInfo}>
            <p className={styles.cardTitle}>{song.title}</p>
            <p className={styles.cardMeta}>
              {song.tuning ?? 'EADG'} · {song.bpm ? `${Math.round(song.bpm)} BPM` : '—'} · {song.totalNotes ?? 0} notas
            </p>
            <p className={styles.cardDate}>{formatDate(song.createdAt)}</p>
          </div>
          <button
            className={`${styles.playBtn} ${loadingId === song.songId ? styles.playBtnLoading : ''}`}
            onClick={() => handleLoad(song)}
            disabled={!song.tabId || loadingId !== null}
            aria-label={`Tocar ${song.title}`}
          >
            {loadingId === song.songId ? <span className={styles.btnSpinner} /> : '▶'}
          </button>
        </div>
      ))}
    </div>
  );
}
