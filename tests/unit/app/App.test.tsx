import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/features/world/WorldCanvas', () => ({
  WorldCanvas: () => null,
}));

import { App } from '../../../src/app/App';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('App routes', () => {
  it('renders the playable-world home and demo call to action', () => {
    render(<App pathname="/" />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Turn your server into a world worth exploring.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('World prototype')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Northstar Commons' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore demo map' })).toHaveAttribute(
      'href',
      '/map/demo',
    );
    expect(document.title).toBe('Dmap — Your Discord world');
  });

  it('renders the demo and not-found routes with exact copy', () => {
    const { rerender } = render(<App pathname="/map/demo" />);
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Northstar Commons')).toBeInTheDocument();
    expect(within(banner).getByRole('status')).toHaveTextContent('Playable demo · local data');
    expect(document.title).toBe('Northstar Commons — Dmap');

    rerender(<App pathname="/missing" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Page not found — Dmap');
  });
});
