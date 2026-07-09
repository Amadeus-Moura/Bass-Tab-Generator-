import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './LibraryPage.module.css';

interface LibraryEntry {
  songId:        string;
  title:         string;
  artist:        string | null;
  bpm:           number | null;
  totalNotes:    number | null;
  totalMeasures: number | null;
  tuning:        string | null;
  tabId:         string | null;
  createdAt:     string;
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function LibraryPage() {
  const navigate = useNavigate();
  const [songs,      setSongs]      = useState<LibraryEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadingId,  setLoadingId]  = useState<string | null>(null);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editValue,  setEditValue]  = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  const fetchLibrary = () => {
    setLoading(true);
    fetch('/api/library')
      .then((r) => r.json())
      .then((d) => { setSongs(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchLibrary(); }, []);

  // Auto-focus rename input
  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const openPlayer = async (song: LibraryEntry) => {
    if (!song.tabId || loadingId) return;
    setLoadingId(song.songId);
    try {
      navigate(`/player/${song.songId}`);
    } finally {
      setLoadingId(null);
    }
  };

  const startRename = (song: LibraryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(song.songId);
    setEditValue(song.title);
  };

  const commitRename = async (songId: string) => {
    const trimmed = editValue.trim();
    if (!trimmed) { setEditingId(null); return; }
    try {
      await fetch(`/api/songs/${songId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      setSongs((prev) => prev.map((s) => s.songId === songId ? { ...s, title: trimmed } : s));
    } catch { /* silently fail */ }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, songId: string) => {
    if (e.key === 'Enter')  commitRename(songId);
    if (e.key === 'Escape') setEditingId(null);
  };

  return (
    <div className={styles.root}>
      {/* bg */}
      <div className={styles.bg} aria-hidden>
        <div className={styles.orb1} /><div className={styles.orb2} />
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        <Link to="/" className={styles.navLogo}>🎸 <span>Bass Tab</span></Link>
        <div className={styles.navLinks}>
          <Link to="/"        className={styles.navLink}>Início</Link>
          <Link to="/library" className={`${styles.navLink} ${styles.navLinkActive}`}>Biblioteca</Link>
          <Link to="/upload"  className={styles.navCta}>⬆ Upload</Link>
        </div>
      </nav>

      <main className={styles.main}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Biblioteca</h1>
            <p className={styles.pageSub}>
              {songs.length > 0 ? `${songs.length} música${songs.length > 1 ? 's' : ''} salva${songs.length > 1 ? 's' : ''}` : 'Sua coleção de tablaturas'}
            </p>
          </div>
          <Link to="/upload" className={styles.uploadBtn}>⬆ Novo Upload</Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className={styles.center}><div className={styles.spinner} /></div>
        ) : songs.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🎵</span>
            <p className={styles.emptyTitle}>Nenhuma música ainda</p>
            <p className={styles.emptyDesc}>Faça o upload de um áudio para gerar sua primeira tablatura.</p>
            <Link to="/upload" className={styles.emptyBtn}>⬆ Fazer Upload</Link>
          </div>
        ) : (
          <div className={styles.list}>
            {/* Table header */}
            <div className={`${styles.row} ${styles.rowHeader}`}>
              <div className={styles.colPlay} />
              <div className={styles.colTitle}>Título</div>
              <div className={styles.colMeta}>Info</div>
              <div className={styles.colDate}>Data</div>
              <div className={styles.colActions} />
            </div>

            {songs.map((song) => (
              <div
                key={song.songId}
                className={`${styles.row} ${loadingId === song.songId ? styles.rowLoading : ''}`}
                onClick={() => openPlayer(song)}
              >
                {/* Play */}
                <div className={styles.colPlay}>
                  <div className={styles.playBtn}>
                    {loadingId === song.songId
                      ? <span className={styles.miniSpinner} />
                      : <span>▶</span>}
                  </div>
                </div>

                {/* Title (editable) */}
                <div className={styles.colTitle} onClick={(e) => e.stopPropagation()}>
                  {editingId === song.songId ? (
                    <input
                      ref={editRef}
                      className={styles.renameInput}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitRename(song.songId)}
                      onKeyDown={(e) => handleKeyDown(e, song.songId)}
                    />
                  ) : (
                    <span className={styles.songTitle}>{song.title}</span>
                  )}
                </div>

                {/* Meta */}
                <div className={styles.colMeta}>
                  <span className={styles.metaTag}>{song.tuning ?? 'EADG'}</span>
                  {song.bpm && <span className={styles.metaTag}>{Math.round(song.bpm)} BPM</span>}
                  {song.totalNotes && <span className={styles.metaTag}>{song.totalNotes} notas</span>}
                </div>

                {/* Date */}
                <div className={styles.colDate}>{fmt(song.createdAt)}</div>

                {/* Actions */}
                <div className={styles.colActions} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={styles.actionBtn}
                    title="Renomear"
                    onClick={(e) => startRename(song, e)}
                  >✏️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
