import type { ButtonPetKind } from './pets';

/**
 * A pixel critter that lives on a button and animates continuously.
 * Purely decorative — hidden from assistive tech and reduced-motion users.
 */
export function ButtonPet({ kind }: { kind: ButtonPetKind }) {
  return (
    <span className={`px-pet px-pet--${kind}`} aria-hidden="true">
      <span className="px-pet__run">
        {kind === 'slimes' ? (
          <>
            <span className="px-pet__sprite px-pet__sprite--slime" />
            <span className="px-pet__sprite px-pet__sprite--slime" />
            <span className="px-pet__sprite px-pet__sprite--slime" />
          </>
        ) : (
          <span className={`px-pet__sprite px-pet__sprite--${kind}`} />
        )}
      </span>
    </span>
  );
}
