import type { ReactNode } from 'react';

/** Shared game gate for scene loading, connection recovery and failures. */
export function RpgStatePanel({
  title,
  children,
  actions,
  error = false,
  kicker = 'Dmap',
  heading = 'h2',
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  error?: boolean;
  kicker?: string;
  heading?: 'h1' | 'h2';
}) {
  const Heading = heading;
  return (
    <div className="rpg-state" role={error ? 'alert' : 'status'}>
      <div className="rpg-frame rpg-state-panel" data-loading={!error}>
        <span className="rpg-kicker">{kicker}</span>
        <Heading>{title}</Heading>
        <p>{children}</p>
        {!error && (
          <span className="rpg-state-progress" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        {actions && <div className="rpg-state-actions">{actions}</div>}
      </div>
    </div>
  );
}
