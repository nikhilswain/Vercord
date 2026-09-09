import { describe, expect, it } from 'vitest';
import type { WorldTown } from '../../../src/domain/world/protocol';
import type { RpgSample } from '../../../src/features/rpg/types';
import { presentTownScene } from '../../../src/features/rpg/town-presentation';
import { readRpgRoute, resolveRpgTravel, writeRpgRoute } from '../../../src/features/rpg/themes';

const streetId = '030748f2-3d55-4cf6-a1d3-fc123e05e820';
const town: WorldTown = {
  activeStreetId: streetId,
  districts: [
    {
      key: 'd_one',
      label: 'Garden rooms',
      streets: [
        {
          id: streetId,
          number: 2,
          rooms: [{ key: 'r_one', label: '日本語の庭 🌿', type: 'text', landmarkId: 'house:0' }],
        },
      ],
    },
  ],
};
const sample: RpgSample = {
  id: 'village',
  name: 'Street',
  subtitle: 'Saved street',
  background: '#000000',
  bounds: { x: 0, y: 0, width: 1000, height: 800 },
  spawn: { x: 500, y: 600 },
  textures: [],
  stamps: [],
  colliders: [],
  npcs: [],
  lights: [],
  landmarks: [
    {
      id: 'house:0',
      name: 'House',
      description: 'House',
      kind: 'sign',
      x: 100,
      y: 100,
      radius: 50,
    },
    {
      id: 'house:1',
      name: 'House',
      description: 'House',
      kind: 'sign',
      x: 300,
      y: 100,
      radius: 50,
    },
    {
      id: 'town-square',
      name: 'Town square',
      description: 'Square',
      kind: 'sign',
      x: 600,
      y: 600,
      radius: 50,
    },
  ],
};

describe('saved town presentation', () => {
  it('labels houses across all continuous neighborhoods using roof anchors and keeps titles above them', () => {
    const continuous: WorldTown = {
      continuous: true,
      activeStreetId: null,
      districts: [
        town.districts[0]!,
        {
          key: 'd_two',
          label: 'Gathering',
          streets: [
            {
              id: 'second',
              number: 1,
              rooms: [
                { key: 'r_two', label: 'fireside-chat', type: 'voice', landmarkId: 'house:1' },
              ],
            },
          ],
        },
      ],
    };
    const saved = {
      ...sample,
      landmarks: sample.landmarks.map((landmark) => ({
        ...landmark,
        labelAnchor: { x: landmark.x + 3, y: landmark.y - 190 },
      })),
    };
    const before = structuredClone(saved);
    const result = presentTownScene(saved, 'A community', continuous);
    expect(result.name).toBe('A community');
    expect(
      result.signage?.filter((label) => label.kind === 'room').map((label) => label.text),
    ).toEqual(['日本語の庭 🌿', 'fireside-chat']);
    expect(result.signage?.find((label) => label.text === 'fireside-chat')).toMatchObject({
      x: 303,
      y: -90,
      roomType: 'voice',
    });
    expect(result.signage?.find((label) => label.text === 'Gathering')?.y).toBeLessThan(-90);
    expect(result.signage?.some((label) => label.text === 'A community')).toBe(false);
    expect(result.townSquareNavigation).toBe(false);
    expect(result.stamps).toBe(saved.stamps);
    expect(saved).toEqual(before);
    const filtered = presentTownScene(saved, 'A community', {
      ...continuous,
      districts: [continuous.districts[1]!],
    });
    expect(filtered.landmarks.some((landmark) => landmark.id === 'house:0')).toBe(false);
    expect(JSON.stringify(filtered.signage)).not.toContain('日本語');
    expect(filtered.colliders).toBe(saved.colliders);
  });

  it('binds authorized labels to saved houses without changing geometry or the saved document', () => {
    const before = structuredClone(sample);
    const result = presentTownScene(sample, 'A community', town);
    expect(result.name).toBe('Garden rooms');
    expect(result.landmarks.find((landmark) => landmark.id === 'house:0')).toMatchObject({
      name: '日本語の庭 🌿',
      x: 100,
      y: 100,
    });
    expect(result.landmarks.some((landmark) => landmark.id === 'house:1')).toBe(false);
    expect(result.signage?.map((label) => label.text)).toContain('日本語の庭 🌿');
    expect(result.signage?.some((label) => label.roomType === 'text')).toBe(true);
    expect(result.stamps).toBe(sample.stamps);
    expect(result.colliders).toBe(sample.colliders);
    expect(sample).toEqual(before);
    expect(JSON.stringify(result.signage)).not.toContain('r_one');
  });

  it('keeps square scenery unchanged and never labels dungeon houses as channels', () => {
    const square = presentTownScene(sample, 'A community', { ...town, activeStreetId: null });
    expect(square.landmarks).toBe(sample.landmarks);
    const dungeon = { ...sample, id: 'dungeon' as const };
    expect(presentTownScene(dungeon, 'A community', town)).toBe(dungeon);
  });

  it('preserves the street through dungeon URLs and clears it when changing world themes', () => {
    const route = readRpgRoute(`?theme=norse&street=${streetId}`);
    const entered = resolveRpgTravel(route, 'dungeon');
    const url = writeRpgRoute(new URL('https://example.test/play/server'), entered);
    expect(url.searchParams.get('street')).toBe(streetId);
    expect(readRpgRoute(url.search)).toEqual({
      theme: 'dungeon',
      world: 'norse',
      street: streetId,
    });
    expect(resolveRpgTravel(entered, 'return')).toEqual(route);
    const switched = resolveRpgTravel(route, 'village');
    expect(writeRpgRoute(url, switched).searchParams.has('street')).toBe(false);
  });
});
