import type { ReactNode } from 'react';

export interface AppHeaderProps {
  context?: string;
  status?: ReactNode;
}

export function AppHeader({ context, status }: AppHeaderProps) {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Dmap home">
        <span className="brand-mark" aria-hidden="true">
          D
        </span>
        <span>Dmap</span>
      </a>
      {context ? <p className="route-context">{context}</p> : null}
      {status ? (
        <div className="header-status" role="status">
          {status}
        </div>
      ) : null}
    </header>
  );
}
