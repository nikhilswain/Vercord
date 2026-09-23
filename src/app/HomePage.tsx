import { AppHeader } from '../components/AppHeader';
import { ButtonPet } from '../components/ButtonPet';
import { SceneBackdrop } from '../components/SceneBackdrop';
import '../styles/home.css';

export function HomePage() {
  return (
    <div className="page-shell app-shell pixel-page home-page">
      <SceneBackdrop src="/screenshots/willowmere.png" variant="hero" />
      <AppHeader status={<span className="build-status">World prototype</span>} />
      <main className="home-main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="hero-context px-eyebrow">Discord server world map</p>
            <h1 id="hero-title">Turn your server into a world worth exploring.</h1>
            <p className="hero-description">
              Dmap turns your published Discord structure into a place you can walk through — one
              district and room at a time.
            </p>
            <div className="hero-actions">
              <a className="px-button px-button--primary" href="/play/demo">
                <span className="px-button__label">Play the demo</span>
                <ButtonPet kind="slimes" />
              </a>
              <a className="px-button px-button--ghost" href="/dashboard">
                <span className="px-button__label">Use your Discord server</span>
                <ButtonPet kind="dog" />
              </a>
            </div>
          </div>
          <a className="hero-scroll" href="#showcase">
            <span aria-hidden="true" />
            Scroll
          </a>
        </section>

        <section className="showcase" id="showcase" aria-labelledby="showcase-title">
          <div className="showcase-copy">
            <p className="px-eyebrow">The playable demo</p>
            <h2 id="showcase-title">Step into Willowmere.</h2>
            <p>
              Wander the crossroads, meet the townsfolk, and follow the forest path to the temple.
              Every channel you publish becomes a room someone can actually walk into.
            </p>
            <a className="showcase-link" href="/play/demo">
              Enter Willowmere
              <span aria-hidden="true">→</span>
            </a>
          </div>
          <figure className="showcase-frame px-frame">
            <img
              src="/screenshots/town-hall.png"
              alt="The Town Hall interior in the Willowmere demo world"
              loading="lazy"
              decoding="async"
            />
          </figure>
        </section>
      </main>
      <footer className="site-footer">
        Built for one carefully published community at a time.
      </footer>
    </div>
  );
}
