import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../../src/app/App';

describe('App', () => {
  it('explains the current and next Dmap milestones', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Turn your server into a world worth exploring.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Foundation ready')).toBeInTheDocument();
    expect(screen.getByText('Foundation')).toBeInTheDocument();
    expect(screen.getByText('Connect Discord')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Preview of category districts and channel rooms' }),
    ).toBeInTheDocument();
  });
});
