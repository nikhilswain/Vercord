import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../../../src/app/App';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('App routes', () => {
  it('renders the atlas-phase home and demo call to action', () => {
    render(<App pathname="/" />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Turn your server into a world worth exploring.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Atlas phase')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Demo illustration' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore demo map' })).toHaveAttribute(
      'href',
      '/map/demo',
    );
    expect(document.title).toBe('Dmap — Your Discord world');
  });

  it('renders the demo and not-found routes with exact copy', () => {
    const { rerender } = render(<App pathname="/map/demo" />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Explore Northstar Commons' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Demo data');
    expect(document.title).toBe('Demo atlas — Dmap');

    rerender(<App pathname="/missing" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Page not found — Dmap');
  });
});
