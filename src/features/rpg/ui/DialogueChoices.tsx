import { useRef, type KeyboardEvent } from 'react';

export interface DialogueChoice {
  id: string;
  label: string;
  onSelect(): void;
}

/** Presentation for future authored choices; this does not add story branches. */
export function DialogueChoices({ choices }: { choices: readonly DialogueChoice[] }) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (event: KeyboardEvent, index: number) => {
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % choices.length
        : event.key === 'ArrowUp'
          ? (index - 1 + choices.length) % choices.length
          : null;
    if (next === null) return;
    event.preventDefault();
    buttons.current[next]?.focus();
  };
  return (
    <div className="rpg-dialogue-choices" role="group" aria-label="What will you do?">
      {choices.map((choice, index) => (
        <button
          key={choice.id}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          onKeyDown={(event) => move(event, index)}
          onClick={choice.onSelect}
        >
          <span aria-hidden="true">
            <img src="/game-assets/ornate-retro/arrow-right.svg" width="12" height="12" alt="" />
          </span>
          {choice.label}
        </button>
      ))}
    </div>
  );
}
