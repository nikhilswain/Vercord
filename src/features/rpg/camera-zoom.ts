/** Normalize mouse notches, trackpad scrolling and browser pinch-wheel events. */
export function wheelZoom(
  current: number,
  event: Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'ctrlKey'>,
  viewportHeight: number,
  minimum: number,
  maximum: number,
): number {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportHeight : 1;
  const delta = Math.max(-160, Math.min(160, event.deltaY * unit));
  const sensitivity = event.ctrlKey ? 0.01 : 0.0025;
  return Math.max(minimum, Math.min(maximum, current * Math.exp(-delta * sensitivity)));
}

export function steppedZoom(current: number, factor: number, minimum: number, maximum: number) {
  const steps = [...new Set([minimum, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, maximum])]
    .filter((step) => step >= minimum && step <= maximum)
    .sort((a, b) => a - b);
  return (
    (factor > 1
      ? steps.find((step) => step > current + 0.001)
      : steps.reverse().find((step) => step < current - 0.001)) ?? current
  );
}
