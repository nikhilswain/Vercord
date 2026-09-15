import type { StoryDialogue, StoryInteraction } from './scenario';

export type StoryInteractionText = Pick<
  StoryInteraction,
  'label' | 'dialogue' | 'locked' | 'repeat'
>;

/** Editable narrative content. Coordinates, prerequisites and rewards stay in scenario definitions. */
export interface StoryBook {
  schemaVersion: number;
  id: string;
  title: string;
  defaultCloseLabel: string;
  synopsis: string;
  lore: string[];
  cast: Array<{ id: string; name: string; description: string }>;
  chapters: Array<{ id: string; title: string; summary: string; interactions: string[] }>;
  notes: string[];
  locations: Record<string, { name: string; subtitle: string }>;
  objectives: Record<string, string>;
  interactions: Record<string, StoryInteractionText>;
}

/** Fail content checks before publishing a book with missing lines or an incomplete script. */
export function validateStoryBook(book: StoryBook): void {
  const ensure = (valid: boolean, field: string) => {
    if (!valid) throw new Error(`Storybook ${book.id}: invalid ${field}`);
  };
  const text = (value: string, field: string) =>
    ensure(typeof value === 'string' && value.trim().length > 0, field);
  ensure(book.schemaVersion === 1, 'schemaVersion');
  ensure(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(book.id), 'id');
  text(book.title, 'title');
  text(book.synopsis, 'synopsis');
  text(book.defaultCloseLabel, 'defaultCloseLabel');
  ensure(book.lore.length > 0, 'lore');
  book.lore.forEach((line, i) => text(line, `lore[${i}]`));
  book.notes.forEach((line, i) => text(line, `notes[${i}]`));
  const cast = new Set<string>();
  for (const member of book.cast) {
    text(member.id, 'cast id');
    ensure(!cast.has(member.id), `duplicate cast id ${member.id}`);
    cast.add(member.id);
    text(member.name, `${member.id}.name`);
    text(member.description, `${member.id}.description`);
  }
  for (const [id, location] of Object.entries(book.locations)) {
    text(location.name, `locations.${id}.name`);
    text(location.subtitle, `locations.${id}.subtitle`);
  }
  for (const [id, objective] of Object.entries(book.objectives))
    text(objective, `objectives.${id}`);
  for (const [id, entry] of Object.entries(book.interactions)) {
    text(entry.label, `${id}.label`);
    for (const variant of ['dialogue', 'locked', 'repeat'] as const) {
      const dialogue = entry[variant];
      if (!dialogue && variant !== 'dialogue') continue;
      ensure(Boolean(dialogue?.lines.length), `${id}.${variant}.lines`);
      text(dialogue!.name, `${id}.${variant}.name`);
      text(dialogue!.role, `${id}.${variant}.role`);
      dialogue!.lines.forEach((line, i) => text(line, `${id}.${variant}.lines[${i}]`));
      if (dialogue!.closeLabel !== undefined)
        text(dialogue!.closeLabel!, `${id}.${variant}.closeLabel`);
    }
  }
  const chapters = new Set<string>(),
    documented = new Set<string>();
  for (const chapter of book.chapters) {
    text(chapter.id, 'chapter id');
    ensure(!chapters.has(chapter.id), `duplicate chapter id ${chapter.id}`);
    chapters.add(chapter.id);
    text(chapter.title, `${chapter.id}.title`);
    text(chapter.summary, `${chapter.id}.summary`);
    for (const id of chapter.interactions) {
      ensure(
        Object.hasOwn(book.interactions, id),
        `${chapter.id} references unknown interaction ${id}`,
      );
      ensure(!documented.has(id), `interaction ${id} appears in multiple chapters`);
      documented.add(id);
    }
  }
  ensure(
    Object.keys(book.interactions).every((id) => documented.has(id)),
    'chapters must include every interaction',
  );
}

/** The game and Markdown exporter consume the same JSON; no renderer or file-system dependency. */
export function createStoryBook<T extends StoryBook>(content: T) {
  validateStoryBook(content);
  const speech = (source: StoryDialogue): StoryDialogue => ({
    ...source,
    lines: [...source.lines],
    closeLabel: source.closeLabel ?? content.defaultCloseLabel,
  });
  return {
    content,
    interaction(id: keyof T['interactions'] & string): StoryInteractionText {
      const source = content.interactions[id]!;
      return {
        label: source.label,
        dialogue: speech(source.dialogue),
        ...(source.locked ? { locked: speech(source.locked) } : {}),
        ...(source.repeat ? { repeat: speech(source.repeat) } : {}),
      };
    },
    objective(id: keyof T['objectives'] & string): string {
      return content.objectives[id]!;
    },
  };
}
