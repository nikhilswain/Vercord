import { useId, type ReactNode } from 'react';

export interface MapControlButtonProps {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}

export function MapControlButton({
  label,
  icon,
  disabled = false,
  onClick,
}: MapControlButtonProps) {
  const idBase = useId();
  const tooltipId = idBase + '-tooltip-0';
  return (
    <span className="map-control-wrap">
      <button
        className="map-control-button"
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
        disabled={disabled}
        onClick={onClick}
      >
        {icon}
      </button>
      <span id={tooltipId} className="map-control-tooltip" role="tooltip">
        {label}
      </span>
    </span>
  );
}
