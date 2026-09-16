import type { Ref } from 'react';
import { Dialog } from '../../../components/Dialog';
import { RPG_APPEARANCES } from '../character';
import { RpgPortrait } from '../RpgPortrait';
import type { RpgDialogue } from '../types';
import { DialogueChoices, type DialogueChoice } from './DialogueChoices';

/** Shared dialogue presentation. Story progression remains owned by the caller. */
export function DialoguePanel({
  open,
  dialogue,
  line,
  advanceRef,
  choices = [],
  onAdvance,
  onClose,
}: {
  open: boolean;
  dialogue: RpgDialogue | null;
  line: number;
  advanceRef?: Ref<HTMLButtonElement>;
  choices?: readonly DialogueChoice[];
  onAdvance(): void;
  onClose(): void;
}) {
  const speaker = RPG_APPEARANCES.find((option) => option.id === dialogue?.appearance);
  return (
    <Dialog
      open={open}
      title={dialogue?.name ?? ''}
      className={`rpg-dialog rpg-dialog--speech${speaker ? ' rpg-dialog--portrait' : ''}`}
      onClose={onClose}
      footer={
        <>
          <span className="rpg-dialog-count">
            {line + 1} / {dialogue?.lines.length ?? 1}
          </span>
          <button className="rpg-button rpg-button--quiet" onClick={onClose}>
            Leave
          </button>
          {choices.length === 0 && (
            <button ref={advanceRef} className="rpg-button" onClick={onAdvance}>
              {dialogue && line < dialogue.lines.length - 1
                ? 'Continue'
                : (dialogue?.closeLabel ?? 'Until next time')}{' '}
              <img
                className="rpg-dialogue-next"
                src="/game-assets/ornate-retro/arrow-down.svg"
                width="14"
                height="14"
                alt=""
              />
            </button>
          )}
        </>
      }
    >
      {speaker && (
        <div className="rpg-dialogue-portrait">
          <RpgPortrait appearance={speaker.id} width={88} height={88} crop="bust" />
        </div>
      )}
      <p className="rpg-speaker-role">{dialogue?.role}</p>
      <div className="rpg-speech-content">
        <p aria-live="polite">{dialogue?.lines[line]}</p>
      </div>
      {choices.length > 0 && <DialogueChoices choices={choices} />}
    </Dialog>
  );
}
