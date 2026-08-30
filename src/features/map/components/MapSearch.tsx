import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';

import type { RoomExplorerController } from '../use-room-explorer';

export interface MapSearchProps {
  explorer: RoomExplorerController;
}

export function MapSearch({ explorer }: MapSearchProps) {
  const idBase = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const resultsId = idBase + '-results-0';
  const activeOptionId =
    explorer.matches.length > 0 ? idBase + '-option-' + explorer.activeResultIndex : undefined;

  const clearAndFocus = () => {
    explorer.clearQuery();
    inputRef.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clearAndFocus();
      return;
    }
    if (explorer.query.length === 0 || explorer.matches.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      explorer.setActiveResultIndex(
        explorer.activeResultIndex + (event.key === 'ArrowDown' ? 1 : -1),
      );
      return;
    }
    if (event.key === 'Enter' && !composingRef.current) {
      event.preventDefault();
      const match = explorer.matches[explorer.activeResultIndex];
      if (match) explorer.selectRoom(match.room.key, inputRef.current);
    }
  };
  const keepInputFocus = (event: PointerEvent<HTMLButtonElement>) => event.preventDefault();

  return (
    <div className="map-search">
      <svg className="map-search-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5" />
        <path d="m12.5 12.5 4 4" />
      </svg>
      <input
        ref={inputRef}
        className="map-search-input"
        type="search"
        role="combobox"
        aria-label="Search rooms"
        aria-autocomplete="list"
        aria-expanded={explorer.query.length > 0}
        aria-controls={explorer.query.length > 0 ? resultsId : undefined}
        aria-activedescendant={activeOptionId}
        value={explorer.query}
        onChange={(event) => explorer.setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
      />
      {explorer.query.length > 0 ? (
        <button
          className="map-search-clear"
          type="button"
          aria-label="Clear room search"
          onClick={clearAndFocus}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      ) : null}
      {explorer.query.length > 0 ? (
        <div className="map-search-popover">
          <p
            className="map-search-count"
            role="status"
            aria-label="Search result count"
            aria-live="polite"
          >
            {explorer.matches.length + (explorer.matches.length === 1 ? ' result' : ' results')}
          </p>
          {explorer.matches.length > 0 ? (
            <ul id={resultsId} className="map-search-results" role="listbox">
              {explorer.matches.map((match, ordinal) => (
                <li key={match.room.key} role="none">
                  <button
                    id={idBase + '-option-' + ordinal}
                    type="button"
                    role="option"
                    aria-selected={ordinal === explorer.activeResultIndex}
                    onPointerDown={keepInputFocus}
                    onClick={() => explorer.selectRoom(match.room.key, inputRef.current)}
                  >
                    <span>{match.room.label}</span>
                    <span>{match.area.label + ' · ' + match.room.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p id={resultsId} className="map-search-empty">
              No rooms found
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
