import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import type { WorldTown } from '../../../domain/world/protocol';
import type { RpgSample } from '../types';
import { AtlasChart, AtlasPins, AtlasPlayer } from './AtlasChart';
import { AtlasIcon } from './AtlasIcon';
import { AtlasPinEditor } from './AtlasPinEditor';
import { AtlasController } from './controller';
import { getAtlasModel } from './model';
import { loadPins, savePins, upsertPin } from './pins';
import type {
  AtlasModel,
  AtlasPin,
  AtlasPlace,
  AtlasSelection,
  PinDraft,
  PinKind,
  Point,
} from './types';
import { DestinationActions, NavigationMapRoute } from '../navigation/NavigationControls';
import { navigationScene, pointDestination } from '../navigation/destinations';
import type { NavigationActions } from '../navigation/types';
import './atlas.css';
import { JourneyMapNote, JourneyMapMarker, type JourneyMapProps } from '../journal/JourneyMapNote';
import { objectivePoint } from '../journal/model';

interface Props extends NavigationActions, JourneyMapProps {
  sample: RpgSample;
  town?: WorldTown;
  name: string;
  scope: string;
  position: Point;
  onClose(): void;
  onFocus?(point: Point): void;
  onBack?(): void;
  showPlayer?: boolean;
  focusAt?: Point | null;
}
export default function RpgAtlasDialog(props: Props) {
  const model = useMemo(() => getAtlasModel(props.sample, props.town), [props.sample, props.town]);
  return <AtlasSession key={`${props.scope}/${model.revision}`} {...props} model={model} />;
}

function AtlasSession({
  model,
  name,
  scope,
  position,
  onClose,
  onFocus,
  sample,
  navigation,
  onNavigate,
  onStopNavigation,
  onBack,
  onJourney,
  objective,
  showPlayer = true,
  focusAt,
}: Props & { model: AtlasModel }) {
  const svgRef = useRef<SVGSVGElement>(null),
    zoomRef = useRef<HTMLOutputElement>(null),
    controller = useRef<AtlasController | null>(null);
  const [selection, setSelection] = useState<AtlasSelection>({
    detailed: false,
    selected: null,
    focused: model.regions.find((r) => r.path)?.id ?? null,
  });
  const [query, setQuery] = useState('');
  const [pins, setPins] = useState(() => loadPins(scope, model));
  const [draft, setDraft] = useState<PinDraft | null>(null);
  const [notice, setNotice] = useState('');
  const [destination, setDestination] = useState<{ place: AtlasPlace } | { pin: AtlasPin } | null>(
    null,
  );
  const destinationRef = useRef<HTMLDivElement>(null);
  const selectedPoint = destination && ('pin' in destination ? destination.pin : destination.place);
  const target =
    destination && selectedPoint
      ? pointDestination(
          sample,
          {
            ...selectedPoint,
            id:
              'place' in destination
                ? (destination.place.landmarkId ?? selectedPoint.id)
                : selectedPoint.id,
          },
          'pin' in destination ? 'pin' : 'place',
        )
      : null;
  const region = model.regions.find(
    (r) => r.id === (selection.detailed ? selection.selected : selection.focused),
  );
  const here = model.regionAt(position);
  const storyPoint = objectivePoint(sample, objective);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const atlas = new AtlasController(svg, model, {
      selection: setSelection,
      pin: setDraft,
      destination: (value) => {
        setDestination(value);
        setQuery('');
      },
      zoom: (value) => {
        if (zoomRef.current) zoomRef.current.value = `${value}%`;
      },
    });
    controller.current = atlas;
    const focus = requestAnimationFrame(() => svg.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(focus);
      atlas.destroy();
      controller.current = null;
    };
  }, [model]);
  useEffect(() => {
    if (focusAt) controller.current?.locate(focusAt);
  }, [focusAt, model]);
  useEffect(() => {
    if (storyPoint) controller.current?.locate(storyPoint);
  }, [storyPoint]);
  useEffect(() => {
    if (!destination) return;
    const frame = requestAnimationFrame(() => {
      const panel = destinationRef.current;
      panel?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      if (panel?.parentElement) panel.parentElement.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [destination]);
  useEffect(() => {
    if (controller.current) controller.current.pins = pins;
  }, [pins]);
  useEffect(() => {
    controller.current?.setEnabled(!draft);
    if (draft) return;
    // Focus after the nested native dialog has closed and removed its inert layer.
    const frame = requestAnimationFrame(() => svgRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [draft]);
  const closeEditor = () => {
    setDraft(null);
  };
  const persist = (next: AtlasPin[]) => {
    setPins(next);
    setNotice(
      savePins(scope, next)
        ? 'Pins saved in this browser.'
        : 'Your browser could not save these pins. They will stay until you close the atlas.',
    );
    closeEditor();
    if (destination && 'pin' in destination && !next.some((pin) => pin.id === destination.pin.id)) {
      if (navigation?.target.id === `pin:${destination.pin.id}`) onStopNavigation?.();
      setDestination(null);
    }
  };
  const save = (kind: PinKind, label: string) => {
    if (!draft) return;
    const next = upsertPin(pins, draft, kind, label);
    if (next) {
      persist(next);
      setDestination({ pin: next.at(-1)! });
    }
  };
  const search = query.trim().toLocaleLowerCase();
  const results = useMemo(
    () =>
      search
        ? model.regions.flatMap((r) => [
            ...(r.name.toLocaleLowerCase().includes(search)
              ? [
                  {
                    id: r.id,
                    name: r.name,
                    region: r.id,
                    detail: r.path ? 'Neighborhood' : 'No channel houses yet',
                    point: null,
                    place: null,
                    available: !!r.path,
                  },
                ]
              : []),
            ...r.places
              .filter((p) => p.name.toLocaleLowerCase().includes(search))
              .map((p) => ({
                id: p.id,
                name: p.name,
                region: r.id,
                detail: r.name,
                point: { x: p.x, y: p.y },
                place: p,
                available: true,
              })),
          ])
        : [],
    [model, search],
  );
  return (
    <Dialog
      open
      title={`${name} atlas`}
      className="rpg-atlas-dialog"
      onClose={onClose}
      onEscape={() => {
        if (draft) {
          closeEditor();
          return;
        }
        if (!controller.current?.back()) onClose();
      }}
    >
      <div className="atlas-shell">
        <button onClick={onClose} className="atlas-exit" aria-label="Back to exploring">
          <AtlasIcon name="close" />
        </button>
        <main className="atlas-main" data-detail={selection.detailed}>
          <section className="atlas-stage" aria-label="Interactive atlas">
            <div className="atlas-map-heading">
              <h1>{name}</h1>
              <p>
                {selection.detailed
                  ? (region?.name ?? 'Between neighborhoods')
                  : model.local
                    ? 'Paths, places and your pins'
                    : `${model.regions.length} ${model.regions.length === 1 ? 'neighborhood' : 'neighborhoods'} · One connected town`}
              </p>
            </div>
            <svg
              ref={svgRef}
              className="atlas-svg"
              tabIndex={0}
              aria-label="World atlas. Use WASD or arrows to choose a region, then Space to explore. Select a place or pin to navigate. In detail, drag or use WASD to pan and Space on empty ground to place a pin."
              role="group"
            >
              <AtlasChart
                model={model}
                selected={destination && 'place' in destination ? destination.place.id : undefined}
              />
              <NavigationMapRoute
                state={navigation}
                position={position}
                scene={navigationScene(sample)}
              />
              <AtlasPins
                pins={pins}
                selected={destination && 'pin' in destination ? destination.pin.id : undefined}
              />
              <JourneyMapMarker point={storyPoint} />
              {showPlayer && <AtlasPlayer position={position} />}
            </svg>
            {selection.detailed && (
              <div className="atlas-crosshair" aria-hidden="true">
                <svg viewBox="-16 -16 32 32">
                  <circle r="10" />
                  <path d="M-16 0H16M0-16V16" />
                </svg>
              </div>
            )}
            {!model.regions.some((r) => r.path) && (
              <p className="atlas-empty">There are no neighborhoods to chart here yet.</p>
            )}
            <div className="atlas-compass" aria-hidden="true">
              <span>N</span>
              <svg viewBox="-30 -30 60 60">
                <circle r="24" />
                <path d="M0-29 7 0 0 29-7 0ZM-29 0 0-7 29 0 0 7ZM0-29V29M-29 0H29" />
              </svg>
            </div>
            <div className="atlas-legend">
              {showPlayer && <span>● You are here</span>}
              {storyPoint && <span>◆ Story destination</span>}
              <span>◇ House / place</span>
              <span>┄ Path</span>
            </div>
            <div className="atlas-camera" aria-label="Map camera">
              <button aria-label="Zoom out" onClick={() => controller.current?.zoom(1 / 0.85)}>
                −
              </button>
              <output ref={zoomRef} aria-label="Map zoom" aria-live="off">
                100%
              </output>
              <button aria-label="Zoom in" onClick={() => controller.current?.zoom(0.85)}>
                +
              </button>
              {showPlayer && (
                <button
                  aria-label="Center on your location"
                  onClick={() => controller.current?.locate(position)}
                >
                  <AtlasIcon name="target" />
                </button>
              )}
            </div>
          </section>
          <aside className="atlas-directory" aria-label="Places directory">
            <JourneyMapNote onJourney={onJourney} objective={objective} />
            {target && (
              <div ref={destinationRef}>
                <DestinationActions
                  key={`${target.id}/${target.name}`}
                  target={target}
                  navigation={navigation}
                  onNavigate={onNavigate}
                  onStopNavigation={onStopNavigation}
                  onLook={onFocus && selectedPoint ? () => onFocus(selectedPoint) : undefined}
                  onEdit={
                    destination && 'pin' in destination
                      ? () => setDraft({ ...destination.pin, existing: destination.pin })
                      : undefined
                  }
                />
                <button className="atlas-back" onClick={() => setDestination(null)}>
                  Back to places
                </button>
              </div>
            )}
            {onBack && (
              <button className="atlas-back" onClick={onBack}>
                ← Forest overview
              </button>
            )}
            <label className="atlas-search">
              <span className="atlas-sr-only">Find a place</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a place…"
              />
              {query && (
                <button
                  type="button"
                  className="atlas-search-clear"
                  aria-label="Clear place search"
                  onClick={(event) => {
                    setQuery('');
                    event.currentTarget.parentElement?.querySelector('input')?.focus();
                  }}
                >
                  <AtlasIcon name="close" />
                </button>
              )}
            </label>
            {selection.detailed && (
              <button className="atlas-back" onClick={() => controller.current?.overview()}>
                ← {model.local ? 'Whole region' : 'Whole town'}
              </button>
            )}
            <h2>
              {search
                ? 'Places found'
                : selection.detailed
                  ? (region?.name ?? 'Explore the town')
                  : 'Where will you go?'}
            </h2>
            <p className="atlas-directory-intro">
              {search
                ? `${results.length} ${results.length === 1 ? 'place' : 'places'}`
                : selection.detailed
                  ? 'Select a place or pin to follow a golden trail. Click empty ground to leave a pin.'
                  : model.local
                    ? 'Choose a place, or look closer to leave a pin.'
                    : 'Each neighborhood belongs to a category in your community. Choose one to look closer.'}
            </p>
            <div className="atlas-directory-list">
              {search
                ? results.map((item) => (
                    <button
                      key={`${item.region}/${item.id}`}
                      disabled={!item.available}
                      onClick={() => {
                        if (item.point) controller.current?.locate(item.point);
                        else controller.current?.select(item.region);
                        if (item.place) setDestination({ place: item.place });
                        setQuery('');
                      }}
                    >
                      <AtlasIcon name="location" />
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <span>›</span>
                    </button>
                  ))
                : selection.detailed && region
                  ? region.places.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          controller.current?.locate(p);
                          setDestination({ place: p });
                        }}
                      >
                        <AtlasIcon name={p.kind} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.kind === 'landmark' ? 'Landmark' : `${p.kind} channel`}</small>
                        </span>
                        <span>›</span>
                      </button>
                    ))
                  : model.regions.map((r) => (
                      <button
                        key={r.id}
                        disabled={!r.path}
                        aria-current={selection.focused === r.id ? 'true' : undefined}
                        onClick={() => controller.current?.select(r.id)}
                      >
                        <AtlasIcon name="region" />
                        <span>
                          <strong>{r.name}</strong>
                          <small>
                            {r.path
                              ? model.local
                                ? `${r.places.length} places`
                                : `${r.places.filter((p) => p.kind !== 'landmark').length} channel houses`
                              : 'No channel houses yet'}
                          </small>
                        </span>
                        <span>›</span>
                      </button>
                    ))}
              {search && !results.length && <p>No places match “{query}”.</p>}
            </div>
            {pins.length > 0 && (
              <details className="atlas-pins-directory" open>
                <summary>Your pins · {pins.length}</summary>
                {pins.map((pin) => (
                  <button
                    key={pin.id}
                    onClick={() => {
                      controller.current?.locate(pin);
                      setDestination({ pin });
                    }}
                  >
                    <bdi>{pin.name}</bdi>
                  </button>
                ))}
              </details>
            )}
            {showPlayer && (
              <div className="atlas-here">
                <AtlasIcon name="player" />
                <span>
                  You are in<strong>{here?.name ?? 'The outskirts'}</strong>
                </span>
                <button
                  aria-label="Find yourself on the atlas"
                  onClick={() => controller.current?.locate(position)}
                >
                  <AtlasIcon name="target" />
                </button>
              </div>
            )}
            {selection.detailed && region && onFocus && (
              <button className="atlas-look" onClick={() => onFocus(region.center)}>
                Look here in the world
              </button>
            )}
            <p className="atlas-notice" role="status">
              {notice ||
                `${pins.filter((p) => p.kind === 'location').length}/5 locations · ${pins.filter((p) => p.kind === 'flower').length}/5 discoveries`}
            </p>
          </aside>
        </main>
        <footer className="atlas-footer">
          <span>
            {selection.detailed
              ? 'Select a place or pin to navigate · Empty ground to pin · Scroll to zoom'
              : 'Drag to explore · WASD to choose · Click / Space to look closer'}
          </span>
          <span>
            {selection.detailed ? 'Esc to zoom out · Esc again to close' : 'Esc to close'}
          </span>
        </footer>
        {draft && (
          <AtlasPinEditor
            draft={draft}
            pins={pins}
            region={model.regionAt(draft)?.name ?? 'The town'}
            onClose={closeEditor}
            onSave={save}
            onRemove={() => persist(pins.filter((p) => p.id !== draft.existing?.id))}
          />
        )}
      </div>
    </Dialog>
  );
}
