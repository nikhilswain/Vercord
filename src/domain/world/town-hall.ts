import type { WorldDocument, WorldScene } from './document';
import type { RpgStamp } from './content/v1/types';
import { TOWN_HALL_TEXTURES } from './content/v1/town-hall-assets';

const PREFIX = 'overworld:town-hall-v2:';
const OLD_PREFIX = 'overworld:town-hall-v1:';
export function hasTownHall(document: WorldDocument): boolean {
  return document.scenes.overworld.stamps.some((s) => s.id.startsWith(PREFIX));
}

/** Upgrade only the reserved civic plot. Channel houses, their IDs and all saved
 * neighborhood geometry remain untouched. The same document drives server collision. */
export function withTownHall(document: WorldDocument): WorldDocument {
  const original = document.scenes.overworld;
  const vault = original.landmarks.find((l) => l.id === 'town-vault');
  const existingHall = original.landmarks.find((l) => l.id === 'town-hall');
  if ((!vault && !existingHall) || !original.terrain || hasTownHall(document)) return document;
  const scene: WorldScene = structuredClone(original);
  const origin = existingHall
    ? { x: existingHall.x - 160, y: existingHall.y - 240 }
    : { x: vault!.x - 5 * 32, y: vault!.y - 6 * 32 };
  const civic = (id: string) => id.startsWith('overworld:town-vault:') || id.startsWith(OLD_PREFIX);
  scene.stamps = scene.stamps.filter((s) => !civic(s.id));
  scene.colliders = scene.colliders.filter((s) => !civic(s.id));
  scene.landmarks = scene.landmarks.filter(
    (l) => !['town-vault', 'town-hall', 'town-noticeboard'].includes(l.id),
  );
  scene.textures = [
    ...scene.textures.filter((s) => !TOWN_HALL_TEXTURES.some((t) => t.key === s.key)),
    ...TOWN_HALL_TEXTURES,
  ];
  const stamp = (texture: string, frame: string, x: number, y: number, depth: number) => {
    const art: RpgStamp = {
      texture,
      frame,
      x: origin.x + x,
      y: origin.y + y,
      depth: origin.y + depth,
    };
    scene.stamps.push({ ...art, id: `${PREFIX}stamp:${scene.stamps.length}` });
  };
  // Two joined gables and an inset timber porch give the civic building its own silhouette.
  for (const x of [64, 160]) {
    stamp('town-hall-timber', 'footing', x, 192, 221);
    stamp('town-hall-timber', 'wall', x, 80, 222);
  }
  for (const x of [52, 148]) stamp('town-hall-thatch', 'roof', x, 16, 223);
  stamp('town-hall-details', 'porch', 132, 128, 224);
  for (const x of [72, 216]) stamp('town-hall-details', 'lantern', x, 144, 225);
  for (const x of [64, 216]) stamp('town-hall-details', 'banner', x, 104, 224);
  stamp('town-hall-details', 'board', 80, 144, 226);
  scene.colliders.push({
    id: `${PREFIX}base`,
    x: origin.x + 64,
    y: origin.y + 120,
    width: 192,
    height: 96,
  });
  // The cellar is reached from inside the hall, never by detached outdoor stairs.
  scene.landmarks.push(
    {
      id: 'town-hall',
      name: 'Town Hall',
      kind: 'portal',
      destination: 'town-hall',
      radius: 38,
      x: origin.x + 160,
      y: origin.y + 240,
      labelAnchor: { x: origin.x + 160, y: origin.y + 4 },
      description:
        'Enter the gathering hall for expedition notices, the traveler register, and the town chronicle. The Lantern Vault lies below.',
    },
    {
      id: 'town-noticeboard',
      name: 'Noticeboard',
      kind: 'sign',
      radius: 40,
      x: origin.x + 96,
      y: origin.y + 248,
      description:
        'Town Hall is open. Expedition notices and the traveler register are inside; the cellar leads to the Lantern Vault.',
    },
  );
  const square = scene.landmarks.find((l) => l.id === 'town-square');
  if (square)
    square.description =
      'The village lanes meet at Town Hall. The reception desk and expedition boards are inside; the Lantern Vault is reached through the cellar.';
  // Frontages remain within the reserved plot and meet the existing public lane.
  const road = scene.terrain!.roads.find(
    (r) =>
      origin.x + 160 >= r.x &&
      origin.x + 160 < r.x + r.width &&
      r.y <= origin.y + 192 &&
      r.y + r.height > origin.y + 192,
  );
  if (road && road.x === origin.x + 128 && road.width === 96)
    scene.terrain!.roads = scene.terrain!.roads.filter((r) => r !== road);
  const end = Math.max(origin.y + 384, road ? road.y + road.height : origin.y + 384);
  // Remove only the former cellar spur; preserve the published surrounding roads.
  if (existingHall)
    scene.terrain!.roads = scene.terrain!.roads.filter(
      (r) => !(r.x === origin.x + 288 && r.y === origin.y + 224 && r.width === 32),
    );
  else
    scene.terrain!.roads.push(
      { x: origin.x + 64, y: origin.y + 224, width: 160, height: end - origin.y - 224 },
      { x: origin.x + 32, y: origin.y + 288, width: 288, height: 96 },
    );
  return { ...document, scenes: { ...document.scenes, overworld: scene } };
}
