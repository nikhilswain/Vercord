import { ESLint } from 'eslint';

const browserMessage = 'Browser code must consume only the browser-safe map domain.';
const dynamicMessage =
  'Browser code must use static imports so private boundaries remain auditable.';
const typeMessage = 'Browser code must not reference private modules through import types.';
const eslint = new ESLint();

async function requireMessages(
  source: string,
  filePath: string,
  ruleId: string,
  count: number,
  message: string,
  failureCode: string,
): Promise<void> {
  const [result] = await eslint.lintText(source, { filePath });
  const messages = result?.messages.filter((entry) => entry.ruleId === ruleId) ?? [];
  if (messages.length !== count || messages.some((entry) => !entry.message.includes(message))) {
    throw new Error(failureCode);
  }
}

await requireMessages(
  [
    "import '../../domain/discord/snapshot';",
    "import '../../domain/discord';",
    "import '../../../worker/index';",
    "import '../../../worker';",
    "import 'src/domain/discord/snapshot';",
    "import 'src/domain/discord';",
    "import 'worker/index';",
    "import 'worker';",
  ].join('\n'),
  'src/features/map/browser-boundary.probe.ts',
  'no-restricted-imports',
  8,
  browserMessage,
  'BROWSER_IMPORT_BOUNDARY_UNVERIFIED',
);

await requireMessages(
  [
    "void import('../../domain/discord');",
    "void import('../../../worker/index');",
    "void import('src/domain/discord/snapshot');",
    "void import('worker');",
  ].join('\n'),
  'src/features/map/dynamic-boundary.probe.ts',
  'no-restricted-syntax',
  4,
  dynamicMessage,
  'BROWSER_DYNAMIC_IMPORT_BOUNDARY_UNVERIFIED',
);

await requireMessages(
  [
    "type A = import('../../domain/discord').GuildStructureSnapshot;",
    "type B = import('../../../worker').default;",
    "type C = import('src/domain/discord/snapshot').GuildStructureSnapshot;",
    "type D = import('worker').default;",
  ].join('\n'),
  'src/features/map/type-boundary.probe.ts',
  'no-restricted-syntax',
  4,
  typeMessage,
  'BROWSER_IMPORT_TYPE_BOUNDARY_UNVERIFIED',
);

const [hookResult] = await eslint.lintText(
  [
    "import { useEffect } from 'react';",
    'export function useGuardrailProbe(value: string) {',
    '  useEffect(() => { void value; }, []);',
    '}',
  ].join('\n'),
  { filePath: 'src/features/map/hooks/use-guardrail-probe.ts' },
);
if (!hookResult?.messages.some((entry) => entry.ruleId === 'react-hooks/exhaustive-deps')) {
  throw new Error('TYPESCRIPT_HOOK_LINT_UNVERIFIED');
}
