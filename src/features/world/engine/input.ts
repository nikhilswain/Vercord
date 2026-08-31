export interface MovementVector {
  x: number;
  y: number;
  moving: boolean;
  sprinting: boolean;
}

type Direction = 'down' | 'left' | 'right' | 'up';

export class WorldInput {
  private readonly pressed = new Set<Direction>();
  private readonly directionStack: Direction[] = [];
  private readonly lastPress = new Map<Direction, number>();
  private virtualAxis = { x: 0, y: 0 };
  private shiftPressed = false;
  private sprintDirection: Direction | null = null;

  public constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.reset);
  }

  public getMovement(): MovementVector {
    let x = 0;
    let y = 0;
    const keyboardDirection = this.directionStack[this.directionStack.length - 1];
    if (keyboardDirection) {
      if (keyboardDirection === 'left') x = -1;
      if (keyboardDirection === 'right') x = 1;
      if (keyboardDirection === 'up') y = -1;
      if (keyboardDirection === 'down') y = 1;
    }

    if (Math.abs(this.virtualAxis.x) > 0.12 || Math.abs(this.virtualAxis.y) > 0.12) {
      const length = Math.max(1, Math.hypot(this.virtualAxis.x, this.virtualAxis.y));
      x = this.virtualAxis.x / length;
      y = this.virtualAxis.y / length;
    }

    return {
      x,
      y,
      moving: x !== 0 || y !== 0,
      sprinting: this.shiftPressed || this.sprintDirection !== null,
    };
  }

  public setVirtualAxis(x: number, y: number, sprinting = false): void {
    this.virtualAxis = { x, y };
    if (sprinting) this.sprintDirection = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
    else if (this.pressed.size === 0) this.sprintDirection = null;
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.reset);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const direction = this.toDirection(event.code);
    if (direction) {
      event.preventDefault();
      if (!this.pressed.has(direction)) {
        const now = performance.now();
        if (now - (this.lastPress.get(direction) ?? 0) <= 300) this.sprintDirection = direction;
        this.lastPress.set(direction, now);
        this.pressed.add(direction);
        this.pushDirection(direction);
      }
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.shiftPressed = true;
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const direction = this.toDirection(event.code);
    if (direction) {
      event.preventDefault();
      this.pressed.delete(direction);
      const index = this.directionStack.indexOf(direction);
      if (index >= 0) this.directionStack.splice(index, 1);
      if (this.sprintDirection === direction) this.sprintDirection = null;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.shiftPressed = false;
  };

  private readonly reset = (): void => {
    this.pressed.clear();
    this.directionStack.splice(0);
    this.virtualAxis = { x: 0, y: 0 };
    this.shiftPressed = false;
    this.sprintDirection = null;
  };

  private pushDirection(direction: Direction): void {
    const existing = this.directionStack.indexOf(direction);
    if (existing >= 0) this.directionStack.splice(existing, 1);
    this.directionStack.push(direction);
  }

  private toDirection(code: string): Direction | null {
    if (code === 'KeyW' || code === 'ArrowUp') return 'up';
    if (code === 'KeyS' || code === 'ArrowDown') return 'down';
    if (code === 'KeyA' || code === 'ArrowLeft') return 'left';
    if (code === 'KeyD' || code === 'ArrowRight') return 'right';
    return null;
  }
}
