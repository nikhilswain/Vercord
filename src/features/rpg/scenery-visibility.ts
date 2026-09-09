import type * as Phaser from 'phaser';

const CELL = 512;
/** Static scenery enters the display pass only around the camera's current cells. */
export class SceneryVisibility {
  private readonly cells = new Map<string, Set<Phaser.GameObjects.Image>>();
  private visible = new Set<Phaser.GameObjects.Image>();
  private previous = '';

  public add(image: Phaser.GameObjects.Image): void {
    const bounds = image.getBounds();
    for (let y = Math.floor(bounds.top / CELL); y <= Math.floor(bounds.bottom / CELL); y++)
      for (let x = Math.floor(bounds.left / CELL); x <= Math.floor(bounds.right / CELL); x++) {
        const key = `${x}:${y}`,
          images = this.cells.get(key) ?? new Set();
        images.add(image);
        this.cells.set(key, images);
      }
    image.setVisible(false);
  }

  public update(camera: Phaser.Cameras.Scene2D.Camera): void {
    const cx = camera.scrollX + camera.width / 2,
      cy = camera.scrollY + camera.height / 2;
    const left = Math.floor((cx - camera.width / (2 * camera.zoom) - 32) / CELL);
    const right = Math.floor((cx + camera.width / (2 * camera.zoom) + 32) / CELL);
    const top = Math.floor((cy - camera.height / (2 * camera.zoom) - 32) / CELL);
    const bottom = Math.floor((cy + camera.height / (2 * camera.zoom) + 32) / CELL);
    const key = `${left}:${top}:${right}:${bottom}`;
    if (key === this.previous) return;
    this.previous = key;
    const next = new Set<Phaser.GameObjects.Image>();
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++)
        for (const image of this.cells.get(`${x}:${y}`) ?? []) next.add(image);
    for (const image of this.visible) if (!next.has(image)) image.setVisible(false);
    for (const image of next) if (!this.visible.has(image)) image.setVisible(true);
    this.visible = next;
  }

  public destroy(): void {
    this.cells.clear();
    this.visible.clear();
  }
}
