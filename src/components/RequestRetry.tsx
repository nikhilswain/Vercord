import { useCallback, useId, useRef, useState, useSyncExternalStore } from 'react';

import './request-retry.css';

interface RequestRetryProps {
  retryAt: number;
  pending?: boolean;
  label?: string;
  onRetry(): Promise<unknown>;
}

function remainingSeconds(retryAt: number): number {
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
}

function useRemainingSeconds(retryAt: number): number {
  const getRemaining = useCallback(() => remainingSeconds(retryAt), [retryAt]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (retryAt <= Date.now()) return () => undefined;
      // Only notify the display; never fetch. Background tabs catch up from the deadline.
      const update = () => {
        onChange();
        if (remainingSeconds(retryAt) === 0) clearInterval(timer);
      };
      const timer = setInterval(update, 1_000);
      document.addEventListener('visibilitychange', update);
      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', update);
      };
    },
    [retryAt],
  );
  return useSyncExternalStore(subscribe, getRemaining, getRemaining);
}

/** A display-only countdown. Expiry enables the button; it never sends a request. */
export function RequestRetry({
  retryAt,
  pending = false,
  label = 'Try again',
  onRetry,
}: RequestRetryProps) {
  const remaining = useRemainingSeconds(retryAt);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const submittingRef = useRef(false);
  const statusId = useId();
  const busy = pending || submitting;
  const waiting = remaining > 0;

  const retry = async () => {
    if (pending || submittingRef.current || Date.now() < retryAt) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFailed(false);
    try {
      await onRetry();
    } catch {
      setFailed(true);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="request-retry">
      <p className="request-retry__status" id={statusId}>
        <span role="timer" aria-live="off" hidden={!waiting || busy}>
          Try again in {Math.floor(remaining / 60)}m {String(remaining % 60).padStart(2, '0')}s
        </span>
        <span role="status">
          {busy
            ? 'Checking Discord…'
            : !waiting
              ? failed
                ? 'Could not complete the request. Try again.'
                : retryAt > 0
                  ? 'You can try again now.'
                  : ''
              : ''}
        </span>
      </p>
      <button
        type="button"
        disabled={waiting || busy}
        aria-busy={busy}
        aria-describedby={statusId}
        onClick={() => void retry()}
      >
        {label}
      </button>
    </div>
  );
}
