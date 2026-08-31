import { AppHeader } from '../../components/AppHeader';
import { WorldCanvas } from '../world/WorldCanvas';
import '../world/world.css';
import { demoMapFixtureResult } from './fixtures/demo-map';

export function DemoMapPage() {
  if (!demoMapFixtureResult.ok) {
    return (
      <main className="world-demo-error" role="alert">
        <h1>World unavailable</h1>
        <p>The local demo snapshot could not be read.</p>
      </main>
    );
  }

  return (
    <div className="world-page">
      <AppHeader
        context={demoMapFixtureResult.snapshot.server.displayName}
        status={<span>Playable demo · local data</span>}
      />
      <main className="world-main">
        <WorldCanvas snapshot={demoMapFixtureResult.snapshot} />
      </main>
    </div>
  );
}
