import type { EnemyPhase } from './session';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Presentation only: the shared combat model still owns movement, damage and impact timing. */
export function slimeMotion(
  phase: EnemyPhase,
  ageMs: number,
  windupMs: number,
  impactMs: number,
  reducedMotion: boolean,
) {
  let lift = 0;
  let squash = 0;
  let alpha = 1;
  if (phase === 'death') {
    const progress = clamp(ageMs / (reducedMotion ? 180 : 500));
    return {
      lift: 0,
      scaleX: reducedMotion ? 1 : 1 + progress * 0.3,
      scaleY: reducedMotion ? 1 : 1 - progress * 0.9,
      alpha: 1 - progress,
      shadowScale: 1,
    };
  }
  if (!reducedMotion) {
    if (phase === 'windup') squash = clamp(ageMs / Math.max(1, windupMs)) * 0.22;
    else if (phase === 'attack') {
      // Feet reach the ground at the exact damage frame, including higher-level attacks.
      const progress = clamp(ageMs / Math.max(1, impactMs));
      const flight = Math.sin(progress * Math.PI);
      const landing = Math.sin(clamp((ageMs - impactMs) / 160) * Math.PI);
      lift = flight * 24;
      squash = Math.max(0, 1 - progress * 5) * 0.22 - flight * 0.16 + landing * 0.23;
    } else if (phase === 'hurt') {
      squash = Math.sin(clamp(ageMs / 180) * Math.PI) * 0.16;
      alpha = 0.85;
    }
  }
  return {
    lift,
    scaleX: 1 + squash * 0.6,
    scaleY: 1 - squash,
    alpha,
    shadowScale: 1 - (lift / 24) * 0.25,
  };
}
