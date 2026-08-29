import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useMediaPreference } from '../../../src/features/map/use-media-preference';
import { setBrowserMediaState } from '../helpers/browser-api-mocks';

function PreferenceProbe({ query }: { query: string }) {
  return <output>{useMediaPreference(query) ? 'matches' : 'does not match'}</output>;
}

describe('useMediaPreference', () => {
  it('publishes live coarse-pointer and reduced-motion changes', () => {
    const { rerender } = render(<PreferenceProbe query="(any-pointer: coarse)" />);
    expect(screen.getByText('does not match')).toBeInTheDocument();
    act(() => setBrowserMediaState({ anyCoarsePointer: true }));
    expect(screen.getByText('matches')).toBeInTheDocument();

    rerender(<PreferenceProbe query="(prefers-reduced-motion: reduce)" />);
    expect(screen.getByText('does not match')).toBeInTheDocument();
    act(() => setBrowserMediaState({ reducedMotion: true }));
    expect(screen.getByText('matches')).toBeInTheDocument();
  });

  it('removes the exact listener on unmount', () => {
    const controlledQuery = matchMedia('(any-pointer: coarse)');
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue(controlledQuery);
    const removeSpy = vi.spyOn(controlledQuery, 'removeEventListener');
    const { unmount } = render(<PreferenceProbe query="(any-pointer: coarse)" />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function));
    matchMediaSpy.mockRestore();
  });
});
