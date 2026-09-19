import { buildTownHall } from '../../../domain/world/content/town-hall-v1/scene';
import type { WorldThemeId } from '../../../domain/world/catalog/themes';
import type { RpgSample } from '../types';

export function presentTownHall(theme: WorldThemeId): RpgSample {
  const layout = buildTownHall(theme);
  return {
    ...layout.scene,
    sceneId: 'town-hall',
    adventure: { id: 'camp' },
    animatedScenery: layout.animations,
    signage: layout.scene.landmarks
      .filter((p) => p.labelAnchor)
      .map((p) => ({
        ...p.labelAnchor!,
        text: p.name,
        kind: 'place',
        maxWidth: 190,
      })),
  };
}

export function presentHallCellar(sample: RpgSample): RpgSample {
  return {
    ...sample,
    landmarks: sample.landmarks.map((l) =>
      l.destination === 'return'
        ? {
            ...l,
            name: 'Return to Town Hall',
            description: 'Climb the cellar stairs back into the gathering hall.',
          }
        : l,
    ),
  };
}
