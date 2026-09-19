import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import { ScenarioProgress } from '../../../src/domain/adventure/scenario';
import { CHOIR } from '../../../src/features/rpg/adventure/hollow-choir';
import { buildComparisonVillage, buildJungleDemo } from '../../../src/features/rpg/demo/scenes';
import { buildFernHollow, buildTempleDemo } from '../../../src/features/rpg/demo/forest-expansion';
import { buildTempleInterior } from '../../../src/features/rpg/demo/temple-interior';
import {
  presentForest,
  PREVIEW_FOREST_SEED,
  withForestTrail,
} from '../../../src/features/rpg/forest/presentation';
import { FOREST_VERSION, type ForestRegionId } from '../../../src/domain/world/forest/catalog';
import { JourneyDialog } from '../../../src/features/rpg/journal/JourneyDialog';
import { navigationContext } from '../../../src/features/rpg/navigation/destinations';
import { RpgSimulation } from '../../../src/features/rpg/simulation';
import { NavigationSession } from '../../../src/features/rpg/navigation/session';
import { objectivePoint } from '../../../src/features/rpg/journal/model';

const forest = (region: ForestRegionId = 'verge') =>
  presentForest({
    contentVersion: FOREST_VERSION,
    worldId: PREVIEW_FOREST_SEED,
    seed: PREVIEW_FOREST_SEED,
    region,
  });
const samples = [
  buildComparisonVillage(),
  buildJungleDemo(),
  buildFernHollow(),
  buildTempleDemo(),
  buildTempleInterior(),
];

describe('optional journey journal', () => {
  it('starts free, remembers preferences, and advances from discoveries made without tracking', () => {
    const area = forest();
    const save = vi.fn();
    const journey = new AdventureJourney({ persist: save });
    const first = journey.journal(area, [area]);
    expect(first.mode).toBe('explore');
    expect(first.pinned).toBeNull();
    expect(first.objective?.id).toBe('verge-site-1');
    journey.discover('alder-run-site-2'); // An explorer can find later clues first.
    expect(journey.journal(area, [area]).objective?.id).toBe('verge-site-1');
    journey.setJournal({ mode: 'story', pinned: first.objective!.id });
    const restored = new AdventureJourney({ snapshot: journey.snapshot() });
    expect(restored.journal(area, [area]).pinned).toBe(first.objective!.id);
    restored.discover('verge-site-1');
    const next = restored.journal(area, [area]);
    expect(next.objective?.id).toBe('verge-site-4');
    expect(next.pinned).toBeNull();
    restored.discover('verge-site-4');
    expect(restored.journal(area, [area]).objective).toBeNull();
    expect(restored.journal(area, [area]).completed).toHaveLength(3);
    expect(save).toHaveBeenCalled();
  });

  it('accepts old saves without journal preferences and never sends the expanded forest to the demo temple', () => {
    const area = forest();
    const old = new AdventureJourney().snapshot();
    delete old.journal;
    const restored = new AdventureJourney({ snapshot: old });
    restored.discover('verge-site-1');
    restored.discover('verge-site-4');
    const journal = restored.journal(area, [...samples, area]);
    expect(journal.mode).toBe('explore');
    expect(journal.objective?.target.area).toBe('alder-run');
    expect(journal.objective?.target.scene).toBe('forest:alder-run');
  });

  it('shows playable temple objectives, allows either seal first, and respects completed saves', () => {
    const facts = new ScenarioProgress();
    const journey = new AdventureJourney({ scenarioProgress: facts });
    const journal = () => journey.journal(samples[0]!, samples);
    expect(journal().objective?.title).toContain('Meet Mira');
    facts.grant(CHOIR.rootBeast); // Older saves did not record the first conversation.
    facts.grant(CHOIR.eastSeal);
    expect(journal().objective?.target.point).toEqual({ x: 8 * 32, y: 27 * 32 });
    facts.grant(CHOIR.westGate);
    expect(journal().objective?.target.point).toEqual({ x: 8 * 32, y: 9 * 32 });
    facts.grant(CHOIR.westSeal);
    expect(journal().objective?.title).toContain('Bound Warden');
    for (const fact of [CHOIR.warden, CHOIR.freed, CHOIR.notes, CHOIR.returned]) facts.grant(fact);
    expect(journal().objective).toBeNull();
    expect(journal().recap).toContain('Mira has her notes');
  });

  it('resolves a story lead across waygates to its actual site without treating entry as completion', () => {
    const town = withForestTrail(samples[0]!);
    const area = forest();
    const journey = new AdventureJourney();
    const objective = journey.journal(town, [town]).objective!;
    const paths = { findPath: vi.fn((from, to) => [from, to]), canTravel: () => true };
    expect(navigationContext(town, paths).resolve(objective.target)).toMatchObject({
      portal: 'Mosswild Verge',
    });
    const resolved = navigationContext(area, paths).resolve(objective.target);
    expect(resolved).toMatchObject({
      point: area.forest!.sites.find((site) => site.id === 'verge-site-1'),
    });
    expect(objectivePoint(area, objective)).toEqual(
      area.forest!.sites.find((site) => site.id === 'verge-site-1'),
    );
    expect(journey.journal(area, [area]).completed).toHaveLength(0);
  });

  it('routes the demo through its existing entrances and can reach every opening forest lead', () => {
    const journey = new AdventureJourney();
    const target = journey.journal(samples[0]!, samples).objective!.target;
    for (const sample of samples.slice(0, 3)) {
      const simulation = new RpgSimulation(sample);
      const resolved = navigationContext(sample, simulation.navigationPaths).resolve(target);
      expect(resolved).toMatchObject({ portal: expect.any(String) });
    }
    for (const region of ['verge', 'alder-run'] as const) {
      const area = forest(region);
      const simulation = new RpgSimulation(area);
      const ctx = navigationContext(area, simulation.navigationPaths);
      if (region === 'alder-run') {
        journey.discover('verge-site-1');
        journey.discover('verge-site-4');
      }
      const objective = journey.journal(area, [area]).objective!;
      const navigation = new NavigationSession();
      expect(navigation.start(objective.target, ctx, area.spawn, 0).ok).toBe(true);
    }
  });

  it('keeps following, pinning and looking separate from navigation, and exposes a failed guide action', () => {
    const area = forest();
    const journal = new AdventureJourney().journal(area, [area]);
    const onGuide = vi.fn(() => ({ ok: false as const, message: 'Open the way first.' }));
    const onJournalChange = vi.fn(),
      onShowObjective = vi.fn(),
      onClose = vi.fn();
    render(
      <JourneyDialog
        journal={journal}
        onGuide={onGuide}
        onJournalChange={onJournalChange}
        onShowObjective={onShowObjective}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Follow story' }));
    expect(onJournalChange).toHaveBeenCalledWith({ mode: 'story' });
    fireEvent.click(screen.getByRole('button', { name: 'Pin objective' }));
    expect(onJournalChange).toHaveBeenCalledWith({ pinned: journal.objective!.id });
    fireEvent.click(screen.getByRole('button', { name: 'Show on map' }));
    expect(onShowObjective).toHaveBeenCalledWith(journal.objective);
    expect(onGuide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guide me' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Open the way first.');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Explore freely' }));
    expect(onJournalChange).toHaveBeenCalledWith({ mode: 'explore', pinned: null });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
