import { AppHeader } from '../components/AppHeader';
import { WorldMapPreview } from '../components/WorldMapPreview';
import '../styles/home.css';

export function HomePage() {
  return (
    <div className="page-shell app-shell">
      <AppHeader status={<span className="build-status">World prototype</span>} />
      <main className="hero">
        <section className="hero-copy" aria-labelledby="hero-title">
          <h1 id="hero-title">Turn your server into a world worth exploring.</h1>
          <p className="hero-context">Discord server world map</p>
          <p className="hero-description">
            Dmap turns carefully published server structure into a place you can walk through—one
            district and room at a time.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="/map/demo">
              Explore demo map
            </a>
            <a className="secondary-action" href="/dashboard">
              Use your Discord server
            </a>
          </div>
        </section>
        <section className="preview-card" aria-labelledby="demo-illustration-title">
          <div className="preview-heading">
            <div>
              <h2 id="demo-illustration-title">Northstar Commons</h2>
              <p>Playable community world</p>
            </div>
            <span>Fixture data</span>
          </div>
          <WorldMapPreview />
        </section>
      </main>
      <footer className="site-footer">
        Built for one carefully published community at a time.
      </footer>
    </div>
  );
}
