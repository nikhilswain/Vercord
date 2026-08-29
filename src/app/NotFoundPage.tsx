import { AppHeader } from '../components/AppHeader';

export function NotFoundPage() {
  return (
    <div className="page-shell">
      <AppHeader context="Lost chart" />
      <main className="not-found">
        <h1>Page not found</h1>
        <p className="route-note">Unknown route</p>
        <p>This route is not part of the Dmap atlas.</p>
        <a className="primary-action" href="/">
          Return home
        </a>
      </main>
    </div>
  );
}
