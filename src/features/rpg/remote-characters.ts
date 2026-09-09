import type Phaser from 'phaser';
import type { RpgPresencePlayer } from '../../domain/presence/rpg-protocol';
import type { Point } from '../world/engine/types';
import { RpgCharacter } from './character';

const INTERPOLATION_MS = 100;
const SNAP_DISTANCE = 160;

interface RemoteView {
  character: RpgCharacter;
  label: Phaser.GameObjects.Text;
  displayName: string;
  appearance: string;
}

interface RemotePlayer {
  player: RpgPresencePlayer;
  from: Point;
  startedAt: number;
  view: RemoteView | null;
  visible: boolean;
}

function positionAt(remote: RemotePlayer, time: number): Point {
  const fraction = Math.min(1, Math.max(0, (time - remote.startedAt) / INTERPOLATION_MS));
  return {
    x: remote.from.x + (remote.player.x - remote.from.x) * fraction,
    y: remote.from.y + (remote.player.y - remote.from.y) * fraction,
  };
}

function fitName(label: Phaser.GameObjects.Text, name: string): void {
  label.setText(name);
  if (label.width <= 184) return;
  const graphemes = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name),
    (entry) => entry.segment,
  );
  while (graphemes.length && label.width > 184) {
    graphemes.pop();
    label.setText(`${graphemes.join('')}…`);
  }
}

/** Owns remote rigs only; network snapshots never alter the local simulation or collisions. */
export class RpgRemoteCharacters {
  private readonly players = new Map<string, RemotePlayer>();
  private readonly ink: string;
  private readonly panel: string;

  public constructor(private readonly scene: Phaser.Scene) {
    const style = getComputedStyle(scene.game.canvas.closest('.rpg-page') ?? scene.game.canvas);
    this.ink = style.getPropertyValue('--rpg-label-ink').trim() || '#fff4dc';
    this.panel = style.getPropertyValue('--rpg-label-panel').trim() || '#19251e';
  }

  public setPlayers(players: readonly RpgPresencePlayer[], time: number): void {
    const present = new Set<string>();
    for (const player of players) {
      present.add(player.id);
      const remote = this.players.get(player.id);
      if (!remote) {
        this.players.set(player.id, {
          player,
          from: { x: player.x, y: player.y },
          startedAt: time,
          view: null,
          visible: false,
        });
        continue;
      }
      if (remote.player === player) continue;
      if (remote.player.x !== player.x || remote.player.y !== player.y) {
        const current = positionAt(remote, time);
        remote.from =
          Math.hypot(player.x - current.x, player.y - current.y) > SNAP_DISTANCE
            ? { x: player.x, y: player.y }
            : current;
        remote.startedAt = time;
      }
      remote.player = player;
    }
    for (const [id, remote] of this.players) {
      if (present.has(id)) continue;
      this.destroyView(remote);
      this.players.delete(id);
    }
  }

  public update(camera: Phaser.Cameras.Scene2D.Camera, time: number, reducedMotion: boolean): void {
    for (const remote of this.players.values()) {
      const point = positionAt(remote, time);
      const x = (point.x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2;
      const y = (point.y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2;
      const marginX = Math.max(36 * camera.zoom, 100);
      const visible =
        x + marginX > 0 &&
        x - marginX < camera.width &&
        y + 8 * camera.zoom > 0 &&
        y - 64 * camera.zoom - 28 < camera.height;
      if (!visible) {
        if (remote.visible && remote.view) {
          remote.view.character.container.setVisible(false);
          remote.view.label.setVisible(false);
        }
        remote.visible = false;
        continue;
      }
      // Offscreen peers retain only interpolation data until first entering the viewport.
      const view = remote.view ?? (remote.view = this.createView(remote.player));
      if (!remote.visible) view.character.container.setVisible(true);
      remote.visible = true;
      const player = remote.player;
      if (view.appearance !== player.appearance) {
        view.character.setAppearance(player.appearance);
        view.appearance = player.appearance;
      }
      if (view.displayName !== player.displayName) {
        fitName(view.label, player.displayName);
        view.displayName = player.displayName;
      }
      view.character.update(point.x, point.y, player.direction, player.action, time, reducedMotion);
      view.label
        .setPosition(point.x, point.y - 64)
        .setScale(1 / camera.zoom)
        .setVisible(camera.zoom >= 0.5);
    }
  }

  public destroy(): void {
    for (const remote of this.players.values()) this.destroyView(remote);
    this.players.clear();
  }

  private createView(player: RpgPresencePlayer): RemoteView {
    const label = this.scene.add
      .text(player.x, player.y - 64, '', {
        fontFamily: 'Inter Variable, system-ui, sans-serif',
        fontSize: '12px',
        color: this.ink,
        backgroundColor: this.panel,
        padding: { x: 6, y: 3 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(95002);
    fitName(label, player.displayName);
    return {
      character: new RpgCharacter(this.scene, player.appearance, player.x, player.y),
      label,
      displayName: player.displayName,
      appearance: player.appearance,
    };
  }

  private destroyView(remote: RemotePlayer): void {
    remote.view?.character.destroy();
    remote.view?.label.destroy();
    remote.view = null;
  }
}
