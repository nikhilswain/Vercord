import type { JournalObjective } from './model';
import type { Point } from '../../world/engine/types';

export interface JourneyMapProps {
  onJourney?(): void;
  objective?: JournalObjective | null;
}

/** Shared by every map: looking up a lead never activates navigation. */
export function JourneyMapNote({ onJourney, objective }: JourneyMapProps) {
  if (!onJourney) return null;
  return (
    <div className="journey-map-note">
      <button className="rpg-button" onClick={onJourney}>
        Journey
      </button>
      {objective && (
        <p>
          <strong>{objective.title}</strong>
          <span>{objective.location} · View only</span>
        </p>
      )}
    </div>
  );
}

export function JourneyMapMarker({ point }: { point?: Point }) {
  if (!point) return null;
  return (
    <g
      className="journey-map-marker"
      transform={`translate(${point.x},${point.y})`}
      aria-label="Story destination"
      role="img"
      pointerEvents="none"
    >
      <title>Story destination</title>
      <g className="atlas-screen">
        <path d="M0-14 14 0 0 14-14 0Z" />
        <circle r="4" />
        <text y="32" textAnchor="middle">
          Story destination
        </text>
      </g>
    </g>
  );
}
