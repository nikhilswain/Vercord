import type { HouseInterior } from '../../../domain/world/interiors';
import type { RpgSample } from '../types';
import { presentDoorway } from './doorway';

/** Saved geometry and interaction points remain authoritative; doorway trim is cosmetic. */
export function presentHouse(interior: HouseInterior): RpgSample {
  return presentDoorway({
    ...interior.scene,
    sceneId: interior.landmarkId,
    ...(interior.schemaVersion === 2
      ? {
          animatedScenery: interior.animations,
          houseInteractions: interior.interactions,
        }
      : {}),
  });
}
