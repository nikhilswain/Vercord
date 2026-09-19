import { describe, expect, it, vi } from 'vitest';
import { WORLD_PLAYER_FEET } from '../../../src/domain/world/geometry';
import type { Rect } from '../../../src/domain/world/content/v1/types';
import type { RpgSample } from '../../../src/features/rpg/types';
import { RpgPathfinder } from '../../../src/features/rpg/pathfinding';
import { RpgSimulation } from '../../../src/features/rpg/simulation';
import { NavigationSession } from '../../../src/features/rpg/navigation/session';
import {
  navigationContext,
  pointDestination,
  regionDestination,
  regionRoute,
} from '../../../src/features/rpg/navigation/destinations';
import { FOREST_REGION_IDS } from '../../../src/domain/world/forest/catalog';

const point = (x: number, y: number) => ({ x, y });
const sample = (colliders: Rect[] = []): RpgSample => ({
  id: 'village',
  name: 'Test town',
  subtitle: '',
  bounds: { x: 0, y: 0, width: 640, height: 480 },
  spawn: point(80, 100),
  textures: [],
  stamps: [],
  colliders,
  npcs: [],
  lights: [],
  background: '#14291f',
  landmarks: [
    {
      id: 'house:visible',
      name: 'Library',
      description: '',
      x: 500,
      y: 100,
      radius: 64,
      kind: 'view',
    },
  ],
});
const context = (world: RpgSample) =>
  navigationContext(world, new RpgPathfinder(world.bounds, world.colliders, WORLD_PLAYER_FEET));

describe('golden trail navigation', () => {
  it('uses the same collision geometry without taking control of movement', () => {
    const world = sample([{ x: 240, y: 0, width: 32, height: 260 }]);
    const simulation = new RpgSimulation(world);
    simulation.blocked = true; // Starting from the map is allowed while gameplay input is paused.
    const guide = new NavigationSession();
    const ctx = navigationContext(world, simulation.navigationPaths);
    expect(
      guide.start(pointDestination(world, world.landmarks[0]!), ctx, simulation.player, 0).ok,
    ).toBe(true);
    const path = guide.state!.path;
    expect(path.some((p) => p.y > 260)).toBe(true);
    for (let index = 1; index < path.length; index++)
      expect(ctx.paths.canTravel(path[index - 1]!, path[index]!)).toBe(true);
    simulation.blocked = false;
    simulation.tick(0.05, { x: 0, y: 0, moving: false, sprinting: false });
    expect(simulation.player).toEqual(world.spawn);
  });

  it('replans only after leaving the trail, not every animation tick or stationary check', () => {
    const world = sample(),
      ctx = context(world),
      guide = new NavigationSession();
    const search = vi.spyOn(ctx.paths, 'findPath');
    guide.start(pointDestination(world, world.landmarks[0]!), ctx, world.spawn, 0);
    for (let time = 200; time <= 4000; time += 200) guide.update(ctx, point(120, 104), time);
    expect(search).toHaveBeenCalledTimes(1);
    guide.update(ctx, point(160, 220), 4300);
    expect(search).toHaveBeenCalledTimes(2);
    expect(guide.state?.path[0]).toEqual(point(160, 220));
  });

  it('finishes nearby once, but never arrives through a wall', () => {
    const world = sample([{ x: 240, y: 0, width: 16, height: 260 }]);
    const ctx = context(world),
      guide = new NavigationSession();
    const target = pointDestination(
      world,
      { id: 'pin', name: 'Across the wall', x: 276, y: 100 },
      'pin',
    );
    expect(guide.start(target, ctx, point(228, 100), 0)).toEqual({ ok: true, arrived: false });
    expect(guide.state).not.toBeNull();
    expect(guide.update(ctx, point(278, 100), 500)).toBe('Across the wall');
    expect(guide.state).toBeNull();
    expect(guide.update(ctx, point(278, 100), 1000)).toBeNull();
  });

  it('rejects pins deep inside blocked ground without replacing a working route', () => {
    const world = sample([{ x: 200, y: 180, width: 300, height: 270 }]);
    const ctx = context(world),
      guide = new NavigationSession();
    guide.start(pointDestination(world, world.landmarks[0]!), ctx, world.spawn, 0);
    expect(
      guide.start(
        pointDestination(world, { id: 'water', name: 'Lake', x: 350, y: 320 }, 'pin'),
        ctx,
        world.spawn,
        100,
      ).ok,
    ).toBe(false);
    expect(guide.state?.target.name).toBe('Library');
  });

  it('hides invalid routes when a gate closes, then recovers when it opens', () => {
    const world = sample(),
      guide = new NavigationSession();
    guide.start(pointDestination(world, world.landmarks[0]!), context(world), world.spawn, 0);
    const closed = context(sample([{ x: 240, y: 0, width: 32, height: 480 }]));
    const search = vi.spyOn(closed.paths, 'findPath');
    guide.update(closed, world.spawn, 300);
    expect(guide.state?.status).toBe('blocked');
    expect(guide.state?.path).toEqual([]);
    for (let time = 600; time < 6000; time += 200) guide.update(closed, world.spawn, time);
    expect(search).toHaveBeenCalledTimes(1);
    guide.update(context(world), world.spawn, 6500);
    expect(guide.state?.status).toBe('guiding');
  });

  it('stops when the destination house is removed from the current scene', () => {
    const world = sample(),
      guide = new NavigationSession();
    guide.start(pointDestination(world, world.landmarks[0]!), context(world), world.spawn, 0);
    guide.update(context({ ...world, landmarks: [] }), world.spawn, 400);
    expect(guide.state).toBeNull();
  });

  it('waits at intermediate portals and continues after scene admission', () => {
    const world = sample();
    const verge: RpgSample = {
      ...world,
      sceneId: 'forest:verge',
      forest: { region: 'verge', sites: [], camp: world.spawn },
      forestPortals: [{ id: 'east', target: 'alder-run', x: 500, y: 100 }],
    };
    const alder: RpgSample = {
      ...world,
      sceneId: 'forest:alder-run',
      forest: { region: 'alder-run', sites: [], camp: world.spawn },
      forestPortals: [{ id: 'east', target: 'fern-hollow', x: 500, y: 100 }],
    };
    const fern: RpgSample = {
      ...world,
      sceneId: 'forest:fern-hollow',
      forest: { region: 'fern-hollow', sites: [], camp: world.spawn },
    };
    const guide = new NavigationSession(),
      ctx = context(verge);
    expect(guide.start(regionDestination('fern-hollow'), ctx, world.spawn, 0).ok).toBe(true);
    guide.update(ctx, point(480, 100), 300);
    expect(guide.state?.status).toBe('portal');
    expect(guide.state?.path).toEqual([]);
    guide.update(context(alder), world.spawn, 600);
    expect(guide.state?.status).toBe('guiding');
    expect(guide.state?.portal).toBe('Greater Fern Hollow');
    expect(guide.update(context(fern), world.spawn, 900)).toBe('Greater Fern Hollow');
    expect(guide.state).toBeNull();
  });

  it('connects every forest region to town without new or imaginary portal edges', () => {
    for (const id of FOREST_REGION_IDS) {
      const route = regionRoute(id, 'town');
      expect(route[0]).toBe(id);
      expect(route.slice(-2)).toEqual(['verge', 'town']);
      expect(new Set(route).size).toBe(route.length);
    }
  });

  it('clears route state explicitly and rejects non-finite destinations', () => {
    const world = sample(),
      ctx = context(world),
      guide = new NavigationSession();
    expect(
      guide.start(
        pointDestination(world, { id: 'invalid', name: 'Pin', x: NaN, y: 2 }, 'pin'),
        ctx,
        world.spawn,
        0,
      ).ok,
    ).toBe(false);
    guide.start(pointDestination(world, world.landmarks[0]!), ctx, world.spawn, 0);
    guide.stop();
    expect(guide.state).toBeNull();
  });
});
