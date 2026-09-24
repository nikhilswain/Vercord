import { useEffect, useRef, useState } from 'react';

import { AppHeader } from '../components/AppHeader';
import { ButtonPet } from '../components/ButtonPet';
import { SceneBackdrop } from '../components/SceneBackdrop';
import { SwipeDeck } from '../components/SwipeDeck';
import '../styles/home.css';

export function HomePage() {
  const showcaseRef = useRef<HTMLElement>(null);
  // Reveal immediately when motion is reduced or the observer is unavailable —
  // the copy must never depend on JS to become visible.
  const [revealed, setRevealed] = useState(
    () =>
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (revealed) return;
    const target = showcaseRef.current;
    if (target === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      // Require the section to climb into the lower fifth of the viewport, so
      // the reveal plays on scroll rather than firing while it sits at the edge.
      { rootMargin: '0px 0px -20% 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [revealed]);

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

        <section
          className={revealed ? 'showcase is-visible' : 'showcase'}
          id="showcase"
          aria-labelledby="showcase-title"
          ref={showcaseRef}
        >
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
          <SwipeDeck
            images={[
              { src: '/screenshots/willowmere.png', alt: 'The crossroads of Willowmere' },
              {
                src: '/screenshots/town-hall.png',
                alt: 'The Town Hall interior in the Willowmere demo world',
              },
              {
                src: '/screenshots/mosswild-forest.png',
                alt: 'The forest path beyond Willowmere',
              },
            ]}
            variant="flow"
            className="showcase-deck"
            label="Willowmere"
          />
        </section>
      </main>
      <footer className="site-footer">
        Built for one carefully published community at a time.
      </footer>
    </div>
  );
}
