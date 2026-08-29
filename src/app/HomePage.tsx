import { AppHeader } from '../components/AppHeader';
import { FoundationMapPreview } from '../components/FoundationMapPreview';
import '../styles/home.css';

export function HomePage() {
  return (
    <div className="page-shell app-shell">
      <AppHeader status={<span className="build-status">Atlas phase</span>} />
      <main className="hero">
        <section className="hero-copy" aria-labelledby="hero-title">
          <h1 id="hero-title">Turn your server into a world worth exploring.</h1>
          <p className="hero-context">Discord server world map</p>
          <p className="hero-description">
            Dmap turns carefully published server structure into a clear atlas without exposing
            messages, members, or private spaces.
          </p>
          <a className="primary-action" href="/map/demo">
            Explore demo map
          </a>
        </section>
        <section className="preview-card" aria-labelledby="demo-illustration-title">
          <div className="preview-heading">
            <div>
              <h2 id="demo-illustration-title">Demo illustration</h2>
              <p>Community Atlas</p>
            </div>
            <span>Fixture data</span>
          </div>
          <FoundationMapPreview />
        </section>
      </main>
      <footer className="site-footer">
        Built for one carefully published community at a time.
      </footer>
    </div>
  );
}
