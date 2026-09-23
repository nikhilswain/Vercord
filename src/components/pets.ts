export type ButtonPetKind = 'slime' | 'slimes' | 'cat' | 'dog';

const GUILD_PET_KINDS: ButtonPetKind[] = ['slime', 'cat', 'dog'];

/** Deterministic per-guild critter so a card keeps the same one between renders. */
export function petForSeed(seed: string): ButtonPetKind {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return GUILD_PET_KINDS[hash % GUILD_PET_KINDS.length] ?? 'slime';
}
