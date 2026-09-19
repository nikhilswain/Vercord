import { writeFileSync } from 'node:fs';
import { buildTempleDemo } from '../src/features/rpg/demo/forest-expansion';
import { buildTempleInterior } from '../src/features/rpg/demo/temple-interior';

// Publish only fixed authored geometry for the server. No Phaser, story state, or art enters
// presence. The parity test checks this artifact against the scene authoring functions.
const scenes = { temple: buildTempleDemo(), 'temple-interior': buildTempleInterior() };
const layouts = Object.fromEntries(
  Object.entries(scenes).map(([id, scene]) => [
    id,
    {
      bounds: scene.bounds,
      spawn: scene.spawn,
      colliders: scene.colliders,
    },
  ]),
);
writeFileSync(
  new URL('../src/domain/world/forest/temple-layouts.json', import.meta.url),
  `${JSON.stringify(layouts, null, 2)}\n`,
);
