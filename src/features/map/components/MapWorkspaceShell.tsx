import type { ReactNode } from 'react';

export interface MapWorkspaceShellProps {
  toolbar: ReactNode;
  status: ReactNode;
  viewport: ReactNode;
  details: ReactNode;
  directory: ReactNode;
}

export function MapWorkspaceShell({
  toolbar,
  status,
  viewport,
  details,
  directory,
}: MapWorkspaceShellProps) {
  return (
    <section className="map-workspace-shell" aria-label="Interactive atlas">
      <div className="map-shell-toolbar">{toolbar}</div>
      <div className="map-workspace-grid">
        <div className="map-workspace-map">
          {status}
          <div className="map-shell-viewport">{viewport}</div>
        </div>
        <div className="map-shell-details">{details}</div>
      </div>
      <div className="map-shell-directory">{directory}</div>
    </section>
  );
}
