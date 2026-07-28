import { Link } from 'react-router-dom';
import styles from './HomePage.module.css';

const STEPS = [
  { n: '01', icon: '🔗', title: 'Cole o link',       desc: 'Cole uma URL do YouTube ou arraste um arquivo de áudio.' },
  { n: '02', icon: '⚙️', title: 'Escolha o formato',  desc: 'MP3 ou MP4, qualidade que quiser — 128 kbps até 4K.' },
  { n: '03', icon: '⬇', title: 'Baixe na hora',      desc: 'Download direto para o seu dispositivo. Sem cadastro.' },
];

const FEATURES = [
  { icon: '⬇',  title: 'Download Rápido',      desc: 'yt-dlp integrado — baixe MP3 ou MP4 do YouTube em segundos.' },
  { icon: '📋', title: 'Playlists completas',   desc: 'Cole a URL de uma playlist inteira e receba tudo em um ZIP.' },
  { icon: '🎵', title: 'Áudio sem perdas',      desc: 'Escolha entre 128, 192 ou 320 kbps. Qualidade que você define.' },
  { icon: '🎬', title: 'Vídeo em alta res.',    desc: 'HD 720p, Full HD 1080p ou a melhor qualidade disponível (4K).' },
  { icon: '🎸', title: 'Tablatura de Baixo',   desc: 'IA isola o baixo e transcreve em tablatura interativa com timing.' },
  { icon: '⚡', title: 'Player 60fps',          desc: 'Playhead sincronizado com o áudio. Zero lag, zero re-renders.' },
];

export function HomePage() {
  return (
    <div className={styles.root}>
      {/* Animated bg */}
      <div className={styles.bg} aria-hidden>
        <div className={styles.orb1} /><div className={styles.orb2} /><div className={styles.orb3} />
        <div className={styles.dotGrid} />
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        <Link to="/" className={styles.navLogo}>
          <span>⬇</span>
          <span>MediaFlow</span>
        </Link>
        <div className={styles.navLinks}>
          <Link to="/library"  className={styles.navLink}>Biblioteca</Link>
          <Link to="/upload"   className={styles.navLink}>Download</Link>
          <Link to="/playlist" className={styles.navLink}>Playlist</Link>
          <Link to="/upload"   className={styles.navBtnLogin}>Começar</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          yt-dlp · MP3 · MP4 · Tablatura IA
        </div>

        <h1 className={styles.heroTitle}>
          Transforme qualquer vídeo e áudio<br />
          <span className={styles.heroGrad}> em Tabs de Baixo</span>
        </h1>

        <p className={styles.heroSub}>
          Cole um link. Escolha MP3 ou MP4. Faça o download direto no seu dispositivo.
          E obtenha a transcrição de tablatura de baixo por IA.
        </p>

        {/* Waveform decorativo */}
        <div className={styles.waveform} aria-hidden>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className={styles.waveBar} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>

        <div className={styles.heroBtns}>
          <Link to="/upload"   className={styles.ctaPrimary}>⬇ Baixar agora</Link>
          <Link to="/playlist" className={styles.ctaPlaylist}>📋 Baixar playlist</Link>
          <Link to="/library"  className={styles.ctaSecondary}>Ver Biblioteca</Link>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Como funciona</h2>
        <div className={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={i} className={styles.stepCard}>
              <div className={styles.stepNum}>{s.n}</div>
              <div className={styles.stepIcon}>{s.icon}</div>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Funcionalidades</h2>
        <div className={styles.features}>
          {FEATURES.map((f, i) => (
            <div key={i} className={styles.featureCard}>
              <span className={styles.featureIcon}>{f.icon}</span>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA bottom */}
      <section className={styles.ctaSection}>
        <h2 className={styles.ctaTitle}>Pronto para começar?</h2>
        <p className={styles.ctaDesc}>Cole um link do YouTube e baixe em segundos. Grátis, sem cadastro.</p>
        <div className={styles.heroBtns}>
          <Link to="/upload"   className={styles.ctaPrimary}>⬇ Baixar vídeo</Link>
          <Link to="/playlist" className={styles.ctaPlaylist}>📋 Baixar playlist</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>⬇ MediaFlow · {new Date().getFullYear()}</p>
        <a href="https://github.com/Amadeus-Moura/Bass-Tab-Generator-" target="_blank" rel="noreferrer" className={styles.footerLink}>GitHub →</a>
      </footer>
    </div>
  );
}
