export interface BrowserMediaState {
  anyCoarsePointer: boolean;
  reducedMotion: boolean;
}

let capturedPointers = new WeakMap<Element, Set<number>>();
let elementRects = new WeakMap<Element, DOMRect>();
const resizeObservers = new Set<ControlledResizeObserver>();

class ControlledResizeObserver implements ResizeObserver {
  readonly observed = new Set<Element>();

  constructor(readonly callback: ResizeObserverCallback) {
    resizeObservers.add(this);
  }

  observe = (target: Element) => {
    this.observed.add(target);
  };

  unobserve = (target: Element) => {
    this.observed.delete(target);
  };

  disconnect = () => {
    this.observed.clear();
  };
}

function rectFor(element: Element): DOMRect {
  return elementRects.get(element) ?? new DOMRect(0, 0, 0, 0);
}

function installElementMethods(): void {
  Object.defineProperties(Element.prototype, {
    setPointerCapture: {
      configurable: true,
      value(this: Element, pointerId: number) {
        const pointers = capturedPointers.get(this) ?? new Set<number>();
        pointers.add(pointerId);
        capturedPointers.set(this, pointers);
      },
    },
    releasePointerCapture: {
      configurable: true,
      value(this: Element, pointerId: number) {
        capturedPointers.get(this)?.delete(pointerId);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value(this: Element, pointerId: number) {
        return capturedPointers.get(this)?.has(pointerId) ?? false;
      },
    },
    getBoundingClientRect: {
      configurable: true,
      value(this: Element) {
        return rectFor(this);
      },
    },
  });
}

export function setElementRect(element: Element, rect: Partial<DOMRect>): void {
  const current = rectFor(element);
  const next = new DOMRect(
    rect.x ?? current.x,
    rect.y ?? current.y,
    rect.width ?? current.width,
    rect.height ?? current.height,
  );
  elementRects.set(element, next);
  Object.defineProperties(element, {
    clientWidth: { configurable: true, get: () => rectFor(element).width },
    clientHeight: { configurable: true, get: () => rectFor(element).height },
  });
}

export function triggerResize(element: Element, width: number, height: number): void {
  setElementRect(element, { width, height });
  const contentRect = rectFor(element);
  const entry = {
    target: element,
    contentRect,
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
  } satisfies ResizeObserverEntry;
  for (const observer of resizeObservers) {
    if (observer.observed.has(element)) observer.callback([entry], observer);
  }
}

let mediaState: BrowserMediaState = {
  anyCoarsePointer: false,
  reducedMotion: false,
};
const mediaQueries = new Set<ControlledMediaQueryList>();
const animationFrames = new Map<number, FrameRequestCallback>();
let nextAnimationFrameId = 1;

function queryMatches(query: string): boolean {
  if (query === '(any-pointer: coarse)') return mediaState.anyCoarsePointer;
  if (query === '(prefers-reduced-motion: reduce)') return mediaState.reducedMotion;
  return false;
}

class ControlledMediaQueryList extends EventTarget implements MediaQueryList {
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => void) | null = null;

  constructor(readonly media: string) {
    super();
  }

  get matches(): boolean {
    return queryMatches(this.media);
  }

  addListener(listener: ((this: MediaQueryList, event: MediaQueryListEvent) => void) | null): void {
    if (listener) this.addEventListener('change', listener as EventListener);
  }

  removeListener(
    listener: ((this: MediaQueryList, event: MediaQueryListEvent) => void) | null,
  ): void {
    if (listener) this.removeEventListener('change', listener as EventListener);
  }

  dispatchChange(): void {
    const event = new Event('change') as MediaQueryListEvent;
    Object.defineProperties(event, {
      matches: { value: this.matches },
      media: { value: this.media },
    });
    this.dispatchEvent(event);
    this.onchange?.call(this, event);
  }
}

export function setBrowserMediaState(next: Partial<BrowserMediaState>): void {
  const before = new Map([...mediaQueries].map((query) => [query, query.matches]));
  mediaState = { ...mediaState, ...next };
  for (const query of mediaQueries) {
    if (before.get(query) !== query.matches) query.dispatchChange();
  }
}

export function flushAnimationFrames(timestamp = 0): void {
  const callbacks = [...animationFrames.values()];
  animationFrames.clear();
  for (const callback of callbacks) callback(timestamp);
}

let installed = false;

export function installBrowserApiMocks(): void {
  if (installed) return;
  installed = true;
  installElementMethods();
  globalThis.ResizeObserver = ControlledResizeObserver;
  window.matchMedia = (query: string) => {
    const result = new ControlledMediaQueryList(query);
    mediaQueries.add(result);
    return result;
  };
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = nextAnimationFrameId;
    nextAnimationFrameId += 1;
    animationFrames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id: number) => {
    animationFrames.delete(id);
  };
  Element.prototype.scrollIntoView = () => undefined;
}

export function resetBrowserApiMocks(): void {
  capturedPointers = new WeakMap<Element, Set<number>>();
  elementRects = new WeakMap<Element, DOMRect>();
  for (const observer of resizeObservers) observer.disconnect();
  resizeObservers.clear();
  mediaQueries.clear();
  mediaState = { anyCoarsePointer: false, reducedMotion: false };
  animationFrames.clear();
  nextAnimationFrameId = 1;
  Element.prototype.scrollIntoView = () => undefined;
}
