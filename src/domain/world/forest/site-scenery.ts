import { block, ground, object } from '../content/v1/builder';
import { addTree } from '../content/v1/prefabs';
import type { RpgSample } from '../content/v1/types';
import { seededRandom } from '../random';
import type { ForestSite } from './layout';

/** Small, asymmetric landmarks leave the forest floor visible around the discovery. */
export function addForestSiteScenery(sample: RpgSample, site: ForestSite, seed: string): void {
  const random = seededRandom(`${seed}:${site.id}:scenery`);
  const x = site.x / 32,
    y = site.y / 32;
  const stone = (dx: number, dy: number, large = false) => {
    object(
      sample,
      'lpc-rocks',
      large ? 'large' : 'medium',
      x + dx,
      y + dy,
      y + dy + (large ? 2.7 : 0.9),
    );
    block(sample, x + dx + 0.25, y + dy + (large ? 2.3 : 0.5), 1.5, 0.45);
  };
  const name = site.name.toLowerCase();
  if (/perch|vista|ridge|stone|milestone|marker|crossing|ford|scree|pebble/.test(name)) {
    // A perch is a rock outcrop, not a tiled platform between matching boulders.
    stone(-2.5, -4.2, true);
    stone(0.4, -2.2);
    if (random() > 0.45) stone(-3.8, -1.4);
  } else if (/arch|ward|ruin|gate|steps|terrace|porch|masonry|stair|altar/.test(name)) {
    for (let row = -4; row < -1; row++)
      for (let col = -3; col < 3; col++) {
        if (random() > 0.58) continue;
        sample.stamps.push({
          texture: 'forest-weathered-stone',
          x: site.x + col * 32,
          y: site.y + row * 32,
          width: 32,
          height: 32,
          depth: -58,
          tint: random() > 0.5 ? 0xb8c49a : 0xc9c3ad,
        });
      }
    object(sample, 'lpc-pillar', 'broken', x - 3.3, y - 4.1, y - 1.3);
    block(sample, x - 3.15, y - 1.6, 0.7, 0.5);
    object(sample, 'lpc-dungeon-details', 'ivy', x - 3.3, y - 3.6, y - 1.2);
    stone(0.8, -2.1);
  } else if (/oak|tree|orchard|grove|root|bough|hollow/.test(name)) {
    addTree(sample, x - 1.2, y - 2.6, false, 'oldOak');
    if (random() > 0.5) addTree(sample, x + 2.8, y - 3.8, false, 'tallOak');
  } else if (/camp|shelter|rest|hearth|seat/.test(name)) {
    addTree(sample, x - 3, y - 2.6, false, 'tallOak');
    stone(0.2, -1.8);
    object(sample, 'lpc-rocks', 'small', x + 0.6, y - 3.4, y - 2.6);
  } else {
    stone(-3.5, -2.6);
    for (let i = 0; i < 9; i++)
      ground(
        sample,
        'lpc-flowers',
        [1, 3, 5, 7][Math.floor(random() * 4)]!,
        x - 1 + random() * 4,
        y - 4 + random() * 2.5,
        -55,
      );
  }
  // Grass, flowers and gaps soften the edge instead of a bright rectangular slab.
  for (let i = 0; i < 5; i++)
    ground(
      sample,
      'lpc-flowers',
      random() > 0.5 ? 3 : 7,
      x - 3.5 + random() * 7,
      y - 4.5 + random() * 3,
      -54,
    );
}
