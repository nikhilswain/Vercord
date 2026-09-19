import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../../../src/components/Dialog';

describe('dialog dismissal', () => {
  it('owns Escape before the browser close request and keeps nested Escape in the foreground', () => {
    const outerBack = vi.fn();
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <Dialog open title="Map" onEscape={outerBack} onClose={outerClose}>
        <Dialog open title="Pin" onClose={innerClose}>
          <button>Close pin</button>
        </Dialog>
      </Dialog>,
    );
    const button = within(screen.getByRole('dialog', { name: 'Pin' })).getByRole('button');
    expect(fireEvent.keyDown(button, { key: 'Escape' })).toBe(false);
    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerBack).not.toHaveBeenCalled();
    expect(outerClose).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(button, { key: 'Escape', repeat: true })).toBe(false);
    expect(innerClose).toHaveBeenCalledOnce();
  });

  it('notifies the owner after an unpreventable native close rather than leaving stale modal state', () => {
    const back = vi.fn();
    const close = vi.fn();
    render(
      <Dialog open title="Map" onEscape={back} onClose={close}>
        Map contents
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Map' });
    fireEvent(dialog, new Event('cancel', { cancelable: false }));
    expect(back).not.toHaveBeenCalled();
    // The browser removes open before it emits close.
    dialog.removeAttribute('open');
    fireEvent(dialog, new Event('close'));
    expect(close).toHaveBeenCalledOnce();
  });

  it('ignores nested and queued native close events after the dialog has reopened', () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <Dialog open title="Map" onClose={outerClose}>
        <Dialog open title="Pin" onClose={innerClose}>
          Pin contents
        </Dialog>
      </Dialog>,
    );
    const map = screen.getByRole('dialog', { name: 'Map' });
    fireEvent(map, new Event('close'));
    expect(outerClose).not.toHaveBeenCalled();
    const pin = screen.getByRole('dialog', { name: 'Pin' });
    pin.removeAttribute('open');
    fireEvent(pin, new Event('close', { bubbles: true }));
    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
  });

  it('preserves busy and already-handled child Escape behavior', () => {
    const close = vi.fn();
    const { rerender } = render(
      <Dialog open busy title="Saving" onClose={close}>
        Saving
      </Dialog>,
    );
    expect(fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })).toBe(false);
    expect(close).not.toHaveBeenCalled();
    rerender(
      <Dialog open title="Form" onClose={close}>
        <input aria-label="Search" onKeyDown={(event) => event.preventDefault()} />
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
  });
});
