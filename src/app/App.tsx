import { useEffect } from 'react';

import { DemoMapPage } from '../features/map/DemoMapPage';
import { DiscordMapPage } from '../features/map/DiscordMapPage';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { resolveAppRoute } from './routes';

export interface AppProps {
  pathname?: string;
}

export function App({ pathname = window.location.pathname }: AppProps) {
  const route = resolveAppRoute(pathname);
  useEffect(() => {
    document.title = route.title;
  }, [route.title]);

  switch (route.kind) {
    case 'home':
      return <HomePage />;
    case 'demo':
      return <DemoMapPage />;
    case 'map':
      return <DiscordMapPage slug={route.slug} />;
    default:
      return <NotFoundPage />;
  }
}
