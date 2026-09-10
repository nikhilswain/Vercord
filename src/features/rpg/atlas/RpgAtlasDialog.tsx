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
import type { AtlasModel, AtlasPin, AtlasSelection, PinDraft, PinKind, Point } from './types';
import './atlas.css';

interface Props {
  sample: RpgSample;
  town?: WorldTown;
  name: string;
  scope: string;
  position: Point;
  onClose(): void;
  onFocus?(point: Point): void;
}
export default function RpgAtlasDialog(props: Props) {
  const model = useMemo(() => getAtlasModel(props.sample, props.town), [props.sample, props.town]);
  return (
    <Dialog open title={`${props.name} atlas`} className="rpg-atlas-dialog" onClose={props.onClose}>
      <AtlasSession key={`${props.scope}/${model.revision}`} {...props} model={model} />
    </Dialog>
  );
}

function AtlasSession({
  model,
  name,
  scope,
  position,
  onClose,
  onFocus,
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
  const region = model.regions.find(
    (r) => r.id === (selection.detailed ? selection.selected : selection.focused),
  );
  const here = model.regionAt(position);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const atlas = new AtlasController(svg, model, {
      selection: setSelection,
      pin: setDraft,
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
    if (controller.current) controller.current.pins = pins;
  }, [pins]);
  useEffect(() => {
    controller.current?.setEnabled(!draft);
    if (!draft) svgRef.current?.focus({ preventScroll: true });
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
  };
  const save = (kind: PinKind, label: string) => {
    if (!draft) return;
    const next = upsertPin(pins, draft, kind, label);
    if (next) persist(next);
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
                available: true,
              })),
          ])
        : [],
    [model, search],
  );
  return (
    <div className="atlas-shell">
      <header className="atlas-header">
        <span className="atlas-brand">
          <AtlasIcon name="region" />
          Dmap
        </span>
        <span className="atlas-tab">The atlas</span>
        <button onClick={onClose} className="atlas-exit" aria-label="Back to exploring">
          <AtlasIcon name="close" />
          <span>Back to exploring</span>
        </button>
      </header>
      <main className="atlas-main" data-detail={selection.detailed}>
        <section className="atlas-stage" aria-label="Interactive atlas">
          <div className="atlas-map-heading">
            <h1>{name}</h1>
            <p>
              {selection.detailed
                ? (region?.name ?? 'Between neighborhoods')
                : `${model.regions.length} ${model.regions.length === 1 ? 'neighborhood' : 'neighborhoods'} · One connected town`}
            </p>
          </div>
          <svg
            ref={svgRef}
            className="atlas-svg"
            tabIndex={0}
            aria-label="Town atlas. Use WASD or arrows to choose a region, then Space to explore. In detail, drag or use WASD to pan and Space to place or edit a pin."
            role="group"
          >
            <AtlasChart model={model} />
            <AtlasPins pins={pins} />
            <AtlasPlayer position={position} />
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
            <span>● You are here</span>
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
            <button
              aria-label="Center on your location"
              onClick={() => controller.current?.locate(position)}
            >
              <AtlasIcon name="target" />
            </button>
          </div>
        </section>
        <aside className="atlas-directory" aria-label="Places directory">
          <label className="atlas-search">
            <span className="atlas-sr-only">Find a category or channel</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a place…"
            />
          </label>
          {selection.detailed && (
            <button className="atlas-back" onClick={() => controller.current?.overview()}>
              ← Whole town
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
                ? 'Follow a path, look around, or leave a pin for another visit.'
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
                    <button key={p.id} onClick={() => controller.current?.locate(p)}>
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
                            ? `${r.places.filter((p) => p.kind !== 'landmark').length} channel houses`
                            : 'No channel houses yet'}
                        </small>
                      </span>
                      <span>›</span>
                    </button>
                  ))}
            {search && !results.length && <p>No places match “{query}”.</p>}
          </div>
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
          {selection.detailed && region && onFocus && (
            <button className="atlas-look" onClick={() => onFocus(region.center)}>
              Look here in the town
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
            ? 'Drag / WASD to move · Click / Space to pin · Scroll to zoom'
            : 'Drag to explore · WASD to choose · Click / Space to look closer'}
        </span>
        <span>Esc to return</span>
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
  );
}
