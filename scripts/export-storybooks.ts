import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { validateStoryBook, type StoryBook } from '../src/domain/adventure/storybook';
import {
  FOREST_REGIONS,
  FOREST_REGION_IDS,
  forestNeighbors,
} from '../src/domain/world/forest/catalog';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(root, 'src/content/stories');
const outputDir = resolve(root, 'stories');
const check = process.argv.includes('--check');
let stale = false;

for (const file of readdirSync(sourceDir)
  .filter((name) => name.endsWith('.json'))
  .sort()) {
  const book = JSON.parse(readFileSync(resolve(sourceDir, file), 'utf8')) as StoryBook;
  validateStoryBook(book);
  const lines = [
    `# ${book.title}`,
    '',
    `Generated from [the game’s story source](../src/content/stories/${file}).`,
    'Edit that JSON file, then run `pnpm story:docs`; normal builds also regenerate this document.',
    'The game reads the JSON directly. Do not hand-edit this generated script.',
    '',
    '## Premise',
    '',
    book.synopsis,
    '',
    '## Lore',
    '',
    ...book.lore.flatMap((paragraph) => [paragraph, '']),
    '## Cast',
    '',
    ...book.cast.flatMap((member) => [`**${member.name}** — ${member.description}`, '']),
    '## Playable story',
    '',
    ...book.chapters.flatMap((chapter, i) => [
      `${i + 1}. **${chapter.title}.** ${chapter.summary}`,
      '',
    ]),
    '## Complete dialogue script',
    '',
    'Each numbered line is one dialogue page. “Locked” is the response before a prerequisite is met;',
    '“Repeat” is the response after a one-time action has already been completed.',
    `The default closing button reads **${book.defaultCloseLabel}**.`,
    '',
  ];
  for (const chapter of book.chapters) {
    lines.push(`### ${chapter.title}`, '');
    for (const id of chapter.interactions) {
      const entry = book.interactions[id]!;
      lines.push(`#### ${entry.label} — \`${id}\``, '');
      for (const [variant, label] of [
        ['locked', 'Locked'],
        ['dialogue', 'Main dialogue'],
        ['repeat', 'Repeat'],
      ] as const) {
        const speech = entry[variant];
        if (!speech) continue;
        lines.push(`**${label}: ${speech.name}**`, '', `*${speech.role}*`, '');
        speech.lines.forEach((line, i) => lines.push(`${i + 1}. ${line}`, ''));
        if (speech.closeLabel) lines.push(`Closing button: **${speech.closeLabel}**.`, '');
      }
    }
  }
  lines.push('## In-game objectives', '');
  for (const [id, text] of Object.entries(book.objectives)) lines.push(`- \`${id}\`: ${text}`);
  lines.push('', '## Location text', '');
  for (const location of Object.values(book.locations))
    lines.push(`**${location.name}** — ${location.subtitle}`, '');
  lines.push('## Current scope and future decisions', '');
  for (const note of book.notes) lines.push(`- ${note}`, '');
  const path = resolve(outputDir, `${book.id}.md`);
  const output = await format(lines.join('\n'), {
    ...(await resolveConfig(path)),
    parser: 'markdown',
  });
  const previous = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : '';
  if (previous !== output) {
    if (check) {
      console.error(
        `Story document is missing or stale: stories/${book.id}.md. Run pnpm story:docs.`,
      );
      stale = true;
    } else {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path, output);
    }
  }
  console.log(
    `${check ? 'Checked' : 'Exported'} ${book.title}: ${Object.keys(book.interactions).length} interactions.`,
  );
}
// Environmental discoveries use the same region catalog as the playable forest.
const forestPath = resolve(outputDir, 'mosswild.md');
const forestLines = [
  '# Mosswild Forest — discovery text',
  '',
  'Generated from [the forest catalog](../src/domain/world/forest/catalog.ts).',
  'Edit that source, then run `pnpm story:docs`; normal builds regenerate this document.',
  '',
  'These are the environmental descriptions read when interacting with discovered places.',
  'See [the forest milestone notes](../FOREST.md) for current scope and future content.',
  '',
];
for (const id of FOREST_REGION_IDS) {
  const region = FOREST_REGIONS[id];
  forestLines.push(
    `## ${region.name}`,
    '',
    region.subtitle,
    '',
    `Trails: ${forestNeighbors(id)
      .map((next) => FOREST_REGIONS[next].name)
      .join(', ')}${id === 'verge' ? ', Town' : ''}.`,
    '',
  );
  for (const [name, text] of region.sites) forestLines.push(`### ${name}`, '', text, '');
}
const forestOutput = await format(forestLines.join('\n'), {
  ...(await resolveConfig(forestPath)),
  parser: 'markdown',
});
if (
  !existsSync(forestPath) ||
  readFileSync(forestPath, 'utf8').replace(/\r\n/g, '\n') !== forestOutput
) {
  if (check) {
    console.error('Forest story document is missing or stale. Run pnpm story:docs.');
    stale = true;
  } else {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(forestPath, forestOutput);
  }
}
console.log(`${check ? 'Checked' : 'Exported'} Mosswild Forest: 96 discoveries.`);
if (stale) process.exitCode = 1;
