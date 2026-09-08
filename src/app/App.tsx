import { useEffect } from 'react';

import { DashboardPage } from '../features/auth/DashboardPage';
import { DemoMapPage } from '../features/map/DemoMapPage';
import { DiscordMapPage } from '../features/map/DiscordMapPage';
import { RpgDemoPage } from '../features/rpg/RpgDemoPage';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { resolveAppRoute } from './routes';

export interface AppProps {
  pathname?: string;
}

export function App({ pathname = window.location.pathname }: AppProps) {
  const route = resolveAppRoute(pathname);
  useEffect(() => {
    // The sample page owns its title as in-game theme travel changes the location.
    if (route.kind !== 'rpg-demo') document.title = route.title;
  }, [route.kind, route.title]);

  switch (route.kind) {
    case 'home':
      return <HomePage />;
    case 'dashboard':
      return <DashboardPage />;
    case 'demo':
      return <DemoMapPage />;
    case 'rpg-demo':
      return <RpgDemoPage />;
    case 'map':
      return <DiscordMapPage key={`map:${route.slug}`} slug={route.slug} />;
    case 'preview':
      return (
        <DiscordMapPage key={`preview:${route.slug}`} slug={route.slug} mode="local-preview" />
      );
    case 'world':
      return <DiscordMapPage key={`world:${route.guildId}`} slug={route.guildId} mode="member" />;
    default:
      return <NotFoundPage />;
  }
}
