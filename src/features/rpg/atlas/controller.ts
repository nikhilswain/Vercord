import { AtlasCamera } from './camera';
import type {
  AtlasModel,
  AtlasPin,
  AtlasPlace,
  AtlasSelection,
  AtlasView,
  PinDraft,
  Point,
} from './types';

interface Callbacks {
  selection(selection: AtlasSelection): void;
  pin(draft: PinDraft): void;
  destination(target: { place: AtlasPlace } | { pin: AtlasPin }): void;
  zoom(percent: number): void;
}
const directions: Record<string, [number, number]> = {
  w: [0, -1],
  ArrowUp: [0, -1],
  s: [0, 1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  ArrowLeft: [-1, 0],
  d: [1, 0],
  ArrowRight: [1, 0],
};
const element = (target: EventTarget | null) => (target instanceof Element ? target : null);

/** Owns transient camera/input state outside React. Selection notifications only
 * fire when the active region changes, not for each animation frame. */
export class AtlasController {
  readonly camera: AtlasCamera;
  selection: AtlasSelection = { detailed: false, selected: null, focused: null };
  pins: readonly AtlasPin[] = [];
  private intent: 'detail' | 'overview' | null = null;
  private enabled = true;
  private abort = new AbortController();
  private resetInput: () => void = () => {};
  private regions: Map<string, SVGGElement>;
  private labels: Map<string, SVGGElement>;

  constructor(
    readonly svg: SVGSVGElement,
    readonly model: AtlasModel,
    private callbacks: Callbacks,
  ) {
    const occupied = model.regions.filter((r) => r.path).map((r) => r.bounds);
    const left = Math.min(...occupied.map((b) => b.x)),
      top = Math.min(...occupied.map((b) => b.y));
    const bounds = occupied.length
      ? {
          x: left,
          y: top,
          width: Math.max(...occupied.map((b) => b.x + b.width)) - left,
          height: Math.max(...occupied.map((b) => b.y + b.height)) - top,
        }
      : model.bounds;
    this.camera = new AtlasCamera(svg, bounds);
    this.regions = new Map(
      [...svg.querySelectorAll<SVGGElement>('[data-region]')].map((node) => [
        node.dataset.region!,
        node,
      ]),
    );
    this.labels = new Map(
      [...svg.querySelectorAll<SVGGElement>('[data-label]')].map((node) => [
        node.dataset.label!,
        node,
      ]),
    );
    this.camera.onChange = () => this.update();
    this.selection.focused = model.regions.find((r) => r.path)?.id ?? null;
    this.bindInput();
    this.update();
  }
  private update() {
    const detailed = this.intent
      ? this.intent === 'detail'
      : this.camera.view.width < this.camera.baseWidth * 0.78;
    let selected = this.selection.selected;
    if (detailed && !this.intent) selected = this.model.regionAt(this.camera.view)?.id ?? selected;
    if (!detailed) selected = null;
    this.setSelection({ ...this.selection, detailed, selected });
    this.svg.dataset.detail = String(detailed);
    const scale = this.camera.scale;
    for (const region of this.model.regions) {
      const node = this.regions.get(region.id);
      if (!node) continue;
      node.classList.toggle('atlas-region--selected', detailed && selected === region.id);
      node.classList.toggle(
        'atlas-region--focused',
        !detailed && this.selection.focused === region.id,
      );
      const label = this.labels.get(region.id);
      if (!label) continue;
      label.classList.toggle(
        'atlas-region--focused',
        !detailed && this.selection.focused === region.id,
      );
      label.classList.toggle(
        'atlas-region--small',
        region.bounds.width / scale < 80 || region.bounds.height / scale < 60,
      );
      label.style.setProperty(
        '--atlas-label-size',
        `${Math.max(14, Math.min(23, (region.bounds.width / scale - 20) / (Math.min(17, region.name.length) * 0.5)))}px`,
      );
      label.classList.toggle('atlas-region--compact', region.bounds.width / scale < 180);
    }
    this.callbacks.zoom(Math.round((this.camera.baseWidth / this.camera.view.width) * 100));
  }
  private setSelection(next: AtlasSelection) {
    const prev = this.selection;
    this.selection = next;
    if (
      prev.detailed !== next.detailed ||
      prev.selected !== next.selected ||
      prev.focused !== next.focused
    )
      this.callbacks.selection({ ...next });
  }
  focus(id: string) {
    this.setSelection({ ...this.selection, focused: id });
    this.update();
  }
  select(id: string) {
    const region = this.model.regions.find((r) => r.id === id);
    if (!region?.path) return;
    this.resetInput();
    this.intent = 'detail';
    this.setSelection({ detailed: true, selected: id, focused: id });
    const b = region.bounds;
    this.camera.moveTo({
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
      width: Math.min(
        Math.max(b.width, b.height * this.camera.aspect) * 1.18,
        this.camera.baseWidth * 0.72,
      ),
    });
    this.update();
    this.svg.focus({ preventScroll: true });
  }
  overview() {
    this.resetInput();
    this.intent = 'overview';
    this.setSelection({
      ...this.selection,
      focused: this.selection.focused ?? this.model.regions.find((r) => r.path)?.id ?? null,
    });
    this.camera.moveTo(this.camera.overview);
    this.update();
    this.svg.focus({ preventScroll: true });
  }
  /** Use the requested view, not an in-flight tween, so two quick Esc presses work. */
  back(): boolean {
    if (!this.enabled) return true;
    // Pausing for a pin editor, resizing or dragging can interrupt a camera move.
    // The last intent alone cannot establish that we actually reached the overview.
    const zoomed = this.camera.target.width < this.camera.baseWidth - 1;
    if (this.intent === 'overview' && !zoomed) return false;
    if (this.selection.detailed || zoomed || this.camera.view.width < this.camera.baseWidth - 1) {
      this.overview();
      return true;
    }
    return false;
  }
  locate(point: Point) {
    this.resetInput();
    this.intent = 'detail';
    const id = this.model.regionAt(point)?.id ?? null;
    this.setSelection({ detailed: true, selected: id, focused: id ?? this.selection.focused });
    this.camera.moveTo({
      ...point,
      width: Math.min(this.camera.target.width, 1800, this.camera.baseWidth * 0.65),
    });
    this.update();
    this.svg.focus({ preventScroll: true });
  }
  zoom(factor: number) {
    this.intent = null;
    this.camera.zoom(factor);
  }
  setEnabled(value: boolean) {
    this.enabled = value;
    this.resetInput();
    this.camera.setEnabled(value);
  }
  private activate(point: Point, target?: Element | null) {
    const pinId = target?.closest<SVGGElement>('[data-pin]')?.dataset.pin;
    const pin = this.pins.find((p) => p.id === pinId);
    if (pin) {
      this.callbacks.destination({ pin });
      return;
    }
    const placeId = target?.closest<SVGGElement>('[data-place]')?.dataset.place;
    const place = placeId
      ? this.model.regions.flatMap((r) => r.places).find((p) => p.id === placeId)
      : undefined;
    if (place) {
      this.callbacks.destination({ place });
      return;
    }
    if (!this.selection.detailed) {
      const id =
        target?.closest<SVGGElement>('[data-region]')?.dataset.region ??
        this.model.regionAt(point)?.id ??
        this.selection.focused;
      if (id) this.select(id);
      return;
    }
    const nearby =
      this.pins.find((p) => p.id === pinId) ??
      this.pins.reduce<AtlasPin | undefined>((best, pin) => {
        const distance = Math.hypot(pin.x - point.x, pin.y - point.y);
        return distance <= 22 * this.camera.scale &&
          (!best || distance < Math.hypot(best.x - point.x, best.y - point.y))
          ? pin
          : best;
      }, undefined);
    if (nearby) {
      this.callbacks.destination({ pin: nearby });
      return;
    }
    const region = this.model.regionAt(point);
    if (!region) return;
    if (
      target?.closest('[data-region],[data-places-region]') &&
      region.id !== this.selection.selected
    ) {
      this.select(region.id);
      return;
    }
    this.callbacks.pin(point);
  }
  private focusDirection(dx: number, dy: number) {
    const current = this.model.regions.find((r) => r.id === this.selection.focused);
    if (!current) return;
    let best: string | undefined,
      score = Infinity;
    for (const region of this.model.regions) {
      if (!region.path) continue;
      const x = region.center.x - current.center.x,
        y = region.center.y - current.center.y,
        forward = x * dx + y * dy;
      if (forward <= 0) continue;
      const candidate = Math.hypot(x, y) + Math.abs(x * dy - y * dx) * 2;
      if (candidate < score) {
        score = candidate;
        best = region.id;
      }
    }
    if (best) this.focus(best);
  }
  private activateTarget(target: Element | null) {
    if (target?.closest('[data-place]')) {
      this.activate(this.camera.view, target);
      return;
    }
    const regionId = target?.closest<SVGGElement>('[data-region]')?.dataset.region;
    if (regionId) {
      this.select(regionId);
      return;
    }
    const pinId = target?.closest<SVGGElement>('[data-pin]')?.dataset.pin;
    const pin = this.pins.find((p) => p.id === pinId);
    if (pin) {
      this.activate(pin, target);
      return;
    }
    if (!this.selection.detailed && this.selection.focused) this.select(this.selection.focused);
    else this.activate(this.camera.view, target);
  }
  private bindInput() {
    const { svg, camera } = this,
      signal = this.abort.signal;
    const pointers = new Map<number, Point>(),
      keys = new Set<string>();
    let start: (Point & { view: AtlasView; hit: Element | null }) | null = null,
      moved = false,
      pinching = false,
      pinchDistance = 0;
    const enabled = () => this.enabled && svg.isConnected;
    const reset = () => {
      for (const id of pointers.keys())
        if (svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
      pointers.clear();
      keys.clear();
      start = null;
      camera.setPan(0, 0);
      svg.classList.remove('atlas-dragging');
    };
    this.resetInput = reset;
    svg.addEventListener(
      'focusin',
      (e) => {
        const id = element(e.target)?.closest<SVGGElement>('[data-region]')?.dataset.region;
        if (id && !this.selection.detailed) this.focus(id);
      },
      { signal },
    );
    svg.addEventListener(
      'pointerdown',
      (e) => {
        if (!enabled() || e.button !== 0) return;
        svg.focus({ preventScroll: true });
        camera.stop();
        this.intent = null;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        svg.setPointerCapture(e.pointerId);
        if (pointers.size === 1) {
          start = { x: e.clientX, y: e.clientY, view: { ...camera.view }, hit: element(e.target) };
          moved = false;
          pinching = false;
        } else {
          pinching = true;
          moved = true;
          const [a, b] = [...pointers.values()];
          pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        }
      },
      { signal },
    );
    svg.addEventListener(
      'pointermove',
      (e) => {
        if (!pointers.has(e.pointerId) || !enabled()) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size > 1) {
          const [a, b] = [...pointers.values()],
            distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          if (distance > 0 && pinchDistance > 0)
            camera.zoom(pinchDistance / distance, { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 });
          pinchDistance = distance;
          return;
        }
        if (!start || pinching) return;
        const dx = e.clientX - start.x,
          dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 5) moved = true;
        if (moved) {
          svg.classList.add('atlas-dragging');
          camera.drag(dx, dy, start.view);
        }
      },
      { signal },
    );
    svg.addEventListener(
      'pointerup',
      (e) => {
        if (!pointers.has(e.pointerId)) return;
        const click = pointers.size === 1 && !moved && !pinching && start,
          hit = start?.hit;
        pointers.delete(e.pointerId);
        if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
        if (click && enabled()) this.activate(camera.point(e.clientX, e.clientY), hit);
        if (!pointers.size) {
          start = null;
          svg.classList.remove('atlas-dragging');
        }
      },
      { signal },
    );
    svg.addEventListener('pointercancel', reset, { signal });
    // Assistive technology activates SVG buttons through a synthetic click.
    // Ordinary clicks were handled on pointerup (where drag/pinch are known).
    svg.addEventListener(
      'click',
      (e) => {
        const target = element(e.target);
        if (enabled() && e.detail === 0 && target?.closest('[data-region],[data-place],[data-pin]'))
          this.activateTarget(target);
      },
      { signal },
    );
    svg.addEventListener(
      'wheel',
      (e) => {
        if (enabled()) {
          this.intent = null;
          camera.wheel(e);
        }
      },
      { signal, passive: false },
    );
    svg.addEventListener(
      'pointerover',
      (e) => {
        const id = element(e.target)?.closest<SVGGElement>('[data-region]')?.dataset.region;
        if (id && !start && !this.selection.detailed) this.focus(id);
      },
      { signal },
    );
    const updatePan = () => {
      let x = 0,
        y = 0;
      for (const key of keys) {
        x += directions[key]![0];
        y += directions[key]![1];
      }
      camera.setPan(Math.sign(x), Math.sign(y));
    };
    // Native nested pin dialogs and form fields retain their own keyboard input.
    document.addEventListener(
      'keydown',
      (e) => {
        const target = element(e.target);
        if (
          !enabled() ||
          e.defaultPrevented ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          target?.closest('input,textarea,select,[contenteditable="true"]') ||
          target?.closest('dialog') !== svg.closest('dialog')
        )
          return;
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key,
          direction = directions[key];
        if (direction) {
          e.preventDefault();
          if (!this.selection.detailed) {
            if (!e.repeat) this.focusDirection(...direction);
          } else if (!keys.has(key)) {
            keys.add(key);
            this.intent = null;
            updatePan();
          }
        } else if (target?.closest('button,a,summary')) return;
        else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) {
            this.activateTarget(target);
          }
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          this.zoom(0.85);
        } else if (e.key === '-') {
          e.preventDefault();
          this.zoom(1 / 0.85);
        }
      },
      { signal },
    );
    document.addEventListener(
      'keyup',
      (e) => {
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (keys.delete(key)) updatePan();
      },
      { signal },
    );
    window.addEventListener('blur', reset, { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) reset();
      },
      { signal },
    );
  }
  destroy() {
    this.resetInput();
    this.abort.abort();
    this.camera.destroy();
  }
}
