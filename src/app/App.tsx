import { FoundationMapPreview } from '../components/FoundationMapPreview';

export function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Dmap home">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span>Dmap</span>
        </a>
        <p className="build-status">
          <span className="status-dot" aria-hidden="true" />
          Foundation ready
        </p>
      </header>
      <main className="hero">
        <section className="hero-copy" aria-labelledby="hero-title">
          <p className="eyebrow">Discord server world map</p>
          <h1 id="hero-title">Turn your server into a world worth exploring.</h1>
          <p className="hero-description">
            Dmap transforms owner-approved server structure into a clear, shareable map without
            exposing messages, members, or private spaces.
          </p>
          <dl className="milestones" aria-label="Project milestones">
            <div>
              <dt>Current</dt>
              <dd>Foundation</dd>
            </div>
            <div>
              <dt>Next</dt>
              <dd>Connect Discord</dd>
            </div>
          </dl>
        </section>
        <section className="preview-card" aria-label="Dmap foundation preview">
          <div className="preview-heading">
            <div>
              <p className="preview-kicker">World preview</p>
              <h2>Community Atlas</h2>
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
