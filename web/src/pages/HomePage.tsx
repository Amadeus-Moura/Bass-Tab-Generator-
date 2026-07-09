import { Link } from 'react-router-dom';
import styles from './HomePage.module.css';

const STEPS = [
  { n: '01', icon: '⬆', title: 'Faça o Upload', desc: 'Envie qualquer arquivo de áudio — .mp3, .wav, .flac, .ogg ou .m4a.' },
  { n: '02', icon: '🤖', title: 'IA Processa',   desc: 'Demucs separa o baixo. Basic Pitch transcreve para MIDI. Tudo automático.' },
  { n: '03', icon: '🎸', title: 'Toque e Edite', desc: 'Player 60fps sincronizado. Alterne entre trastes e notas. Exporte para PDF.' },
];

const FEATURES = [
  { icon: '🎛️', title: 'Separação de Fonte', desc: 'Demucs (Meta AI) isola o baixo com precisão mesmo em mixagens complexas.' },
  { icon: '🎵', title: 'Transcrição MIDI',   desc: 'Basic Pitch (Spotify) converte o áudio do baixo em notas com timing preciso.' },
  { icon: '⚡', title: 'Player 60fps',       desc: 'Playhead e scroll via requestAnimationFrame. Zero re-renders com 700+ notas.' },
  { icon: '🗄️', title: 'Biblioteca Pessoal', desc: 'Tablaturas salvas em PostgreSQL. Carregamento instantâneo sem re-processar.' },
  { icon: '🔀', title: 'Trastes ou Notas',   desc: 'Alterne em tempo real entre exibição de fret numbers e pitch (ex: F#3).' },
  { icon: '📄', title: 'Exportar PDF',       desc: 'Gere um PDF completo da tablatura para imprimir ou arquivar.' },
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
        <Link to="/" className={styles.navLogo}>🎸 <span>Bass Tab</span></Link>
        <div className={styles.navLinks}>
          <Link to="/library" className={styles.navLink}>Biblioteca</Link>
          <Link to="/upload"  className={styles.navLink}>Upload</Link>
          <Link to="/library" className={styles.navBtnLogin}>Entrar</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.badge}><span className={styles.badgeDot} /> Powered by Demucs &amp; Basic Pitch</div>

        <h1 className={styles.heroTitle}>
          Transforme Qualquer Áudio<br />
          <span className={styles.heroGrad}>em Tablatura de Baixo</span>
        </h1>

        <p className={styles.heroSub}>
          Inteligência artificial separa o baixo, transcreve para MIDI e entrega
          uma tablatura interativa com player sincronizado em tempo real.
        </p>

        {/* Waveform */}
        <div className={styles.waveform} aria-hidden>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className={styles.waveBar} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>

        <div className={styles.heroBtns}>
          <Link to="/upload"  className={styles.ctaPrimary}>⬆ Começar agora</Link>
          <Link to="/library" className={styles.ctaSecondary}>Ver Biblioteca</Link>
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
        <h2 className={styles.ctaTitle}>Pronto para transcrever?</h2>
        <p className={styles.ctaDesc}>Envie uma música e tenha a tablatura de baixo em minutos.</p>
        <Link to="/upload" className={styles.ctaPrimary}>⬆ Fazer Upload</Link>
      </section>

      <footer className={styles.footer}>
        <p>🎸 Bass Tab Generator · {new Date().getFullYear()}</p>
        <a href="https://github.com/Amadeus-Moura/Bass-Tab-Generator-" target="_blank" rel="noreferrer" className={styles.footerLink}>GitHub →</a>
      </footer>
    </div>
  );
}
