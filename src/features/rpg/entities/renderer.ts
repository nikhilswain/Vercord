import type Phaser from 'phaser';
import { AmbientSimulation, type AmbientEntity } from './simulation';
import { RpgAnimal } from './animal';
import { RpgCharacter } from '../character';
import type { RpgNpc, RpgNearby, RpgSample } from '../types';
import type { Point } from '../../../domain/world/content/v1/types';
import { containsPoint } from '../../world/engine/collision';
import { DEFAULT_RPG_CHARACTER_ID } from '../../../domain/world/catalog/characters';
import { PetEffects } from './pet-effects';

type EntityView = { rig: RpgAnimal | RpgCharacter; label: Phaser.GameObjects.Text };

/** Ambient residents never become Discord peers or change authoritative player collisions. */
export class RpgAmbientEntities {
  readonly simulation: AmbientSimulation;
  private readonly views = new Map<string, EntityView>();
  private readonly effects: PetEffects;
  private clock = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sample: RpgSample,
    seed: string,
  ) {
    this.simulation = new AmbientSimulation(sample, seed);
    this.effects = new PetEffects(scene);
  }

  update(
    camera: Phaser.Cameras.Scene2D.Camera,
    time: number,
    reducedMotion: boolean,
    player: Point,
  ): void {
    this.clock = Date.now();
    this.simulation.update(this.clock, reducedMotion);
    this.effects.update(this.clock, reducedMotion);
    const width = camera.width / camera.zoom;
    const height = camera.height / camera.zoom;
    const left = camera.scrollX + (camera.width - width) / 2;
    const top = camera.scrollY + (camera.height - height) / 2;
    for (const entity of this.simulation.entities) {
      const visible =
        entity.x >= left - 64 &&
        entity.x <= left + width + 64 &&
        entity.y >= top - 16 &&
        entity.y <= top + height + 64;
      const existing = this.views.get(entity.id);
      if (!visible) {
        existing?.rig.container.setVisible(false);
        existing?.label.setVisible(false);
        continue;
      }
      const view = existing ?? this.createView(entity);
      view.rig.container.setVisible(true);
      view.rig.update(
        entity.x,
        entity.y,
        entity.direction,
        reducedMotion ? 'idle' : entity.action,
        time,
        reducedMotion,
      );
      view.label
        .setPosition(entity.x, entity.y - (entity.kind === 'humanoid' ? 65 : 38))
        .setScale(1 / camera.zoom)
        .setVisible(
          !this.effects.has(entity.id) &&
            (camera.zoom >= 0.75 ||
              (camera.zoom >= 0.5 && Math.hypot(player.x - entity.x, player.y - entity.y) < 72)),
        );
    }
  }

  nearby(player: Point): { ui: RpgNearby; target: RpgNpc } | null {
    const sorted = this.simulation.entities
      .map((entity) => ({ entity, distance: Math.hypot(player.x - entity.x, player.y - entity.y) }))
      .filter(({ distance }) => distance <= 56)
      .sort((a, b) => a.distance - b.distance);
    for (const { entity } of sorted) {
      let clear = true;
      for (let step = 1; step < 8; step++) {
        const x = player.x + ((entity.x - player.x) * step) / 8;
        const y = player.y - 4 + ((entity.y - player.y) * step) / 8;
        if (this.sample.colliders.some((box) => containsPoint(box, x, y))) {
          clear = false;
          break;
        }
      }
      if (clear)
        return {
          ui: {
            id: entity.id,
            label: entity.name,
            action: entity.kind === 'humanoid' ? 'Talk' : 'Pet',
          },
          target: {
            ...entity,
            appearance: entity.appearance ?? '',
            direction: entity.direction,
            lines: entity.lines,
          },
        };
    }
    return null;
  }

  interact(id: string, player: Point): 'talk' | 'pet' | 'busy' | null {
    const entity = this.simulation.entities.find((resident) => resident.id === id);
    if (!entity) return null;
    if (this.effects.has(id)) return 'busy';
    const interaction = entity.interaction;
    this.simulation.hold(id, { facing: player, durationMs: interaction.durationMs });
    if (interaction.kind === 'pet') this.effects.start(id, entity, this.clock);
    return interaction.kind;
  }

  release(id: string): void {
    this.simulation.release(id);
  }

  destroy(): void {
    this.effects.destroy();
    for (const view of this.views.values()) {
      view.rig.destroy();
      view.label.destroy();
    }
    this.views.clear();
  }

  private createView(entity: AmbientEntity): EntityView {
    const rig =
      entity.kind === 'humanoid'
        ? new RpgCharacter(
            this.scene,
            entity.appearance ?? DEFAULT_RPG_CHARACTER_ID,
            entity.x,
            entity.y,
          )
        : new RpgAnimal(this.scene, entity.kind, entity.color ?? 0xa97d52);
    const label = this.scene.add
      .text(
        entity.x,
        entity.y,
        `${entity.name} · ${entity.kind === 'humanoid' ? 'NPC' : entity.kind}`,
        {
          fontFamily: 'Inter Variable, system-ui, sans-serif',
          fontSize: '11px',
          color: '#fff4dc',
          backgroundColor: '#253328',
          padding: { x: 5, y: 3 },
          resolution: 2,
        },
      )
      .setOrigin(0.5, 1)
      .setDepth(95003);
    const view = { rig, label };
    this.views.set(entity.id, view);
    return view;
  }
}
