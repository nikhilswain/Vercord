# Discord Sender Persona Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send Dmap room messages through a managed Discord webhook using the authenticated member's current guild identity, with a clearly attributed bot fallback and member-safe slowmode handling.

**Architecture:** The VPS gateway exclusively owns webhook discovery, credentials, Discord permission checks, and message dispatch. The existing per-guild Durable Object derives current slowmode policy from the live source, persists opaque member/channel reservations, and incorporates native Discord message observations plus conservative event-coverage recovery. Only normalized messages and typed outcomes cross to the browser.

**Tech Stack:** TypeScript 6, discord.js 14, Cloudflare Durable Objects, Zod, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-discord-sender-persona-design.md`

## Global Constraints

- Never use or expose a Discord user token; Discord must retain its application/webhook marker.
- Use one lazy, reusable, bot-owned incoming webhook named `Dmap Relay` per supported channel.
- Webhook credentials stay only in gateway memory and never cross the Worker bridge or enter logs.
- Fallback content is exactly `**<safe display name> says:**\n<message>` and must not mention/ping the actor.
- Set `allowed_mentions`/`allowedMentions` to `{ parse: [] }` on both routes.
- Never retry or bot-fallback after a webhook execution may have reached Discord.
- Set the submitted-content maximum to exactly 1,900 characters; reject rather than truncate.
- Preserve raw-ID opacity at every browser and Worker-storage boundary.
- Advertise `message-persona-v1`; the Worker must reject sends from an older gateway with `GATEWAY_UPDATE_REQUIRED`.
- Do not deploy the Worker, restart the VPS service, or send real Discord messages during automated verification.
- The user requested focused checks only; do not expand into a broad new test suite.

---

### Task 1: Managed webhook relay and attributed bot fallback

**Files:**

- Create: `apps/gateway/src/managed-webhook-relay.ts`
- Create: `apps/gateway/src/managed-webhook-relay.test.ts`
- Modify: `apps/gateway/src/message-commands.ts`
- Modify: `apps/gateway/src/discord.ts`
- Modify: `apps/gateway/package.json`

**Interfaces:**

- Consumes: discord.js `TextChannel | NewsChannel`, authoritative `GuildMember`, the gateway's `dispatchContext`, and the command's `assertAllowed` closure.
- Produces: `ManagedWebhookRelay.resolve(input: ResolveRelayInput): Promise<Webhook | null>`, `ManagedWebhookRelay.invalidate(channelId): void`, `ManagedWebhookRelay.clear(): void`, `safePersona(member): { username: string; avatarURL?: string }`, and fallback content from `attributedContent(member, content): string`.

- [ ] **Step 1: Add focused failing relay tests**

  Cover these observable breaks in `managed-webhook-relay.test.ts`: two concurrent cache misses create exactly one relay; a foreign same-name webhook is not reused; an ambiguous create forces another fetch before any later create; and persona/fallback normalization cannot inject a second Markdown line or actor mention.

  ```ts
  expect(await Promise.all([relay.resolve(input), relay.resolve(input)])).toHaveLength(2);
  expect(channel.createWebhook).toHaveBeenCalledTimes(1);
  expect(attributedContent(memberNamed('**ZERO**\n@everyone'), 'hello')).toBe(
    '**\\*\\*ZERO\\*\\* @everyone says:**\nhello',
  );
  ```

- [ ] **Step 2: Run the focused test and confirm the missing helper fails**

  Run: `pnpm exec vitest run apps/gateway/src/managed-webhook-relay.test.ts`

  Expected: FAIL because `managed-webhook-relay.ts` and its exports do not exist.

- [ ] **Step 3: Implement webhook discovery and cache ownership**

  Implement a maximum 1,000-entry per-channel cache with oldest-entry eviction and a per-channel setup promise. Always fetch on a cache miss, reuse only `WebhookType.Incoming` entries where `webhook.owner?.id === botId` and `webhook.name === 'Dmap Relay'`, and create otherwise with reason `Dmap managed message relay`. Creation runs in a fresh dispatch context so an ambiguous create cannot be repeated without a later authoritative fetch.

  ```ts
  export interface ResolveRelayInput {
    channel: TextChannel | NewsChannel;
    botId: string;
    requestId: string;
    assertAllowed(): void;
  }

  export class ManagedWebhookRelay {
    public resolve(input: ResolveRelayInput): Promise<Webhook | null>;
    public invalidate(channelId: string): void;
    public invalidateGuild(guildId: string): void;
    public clear(): void;
  }
  ```

  Treat setup rate limits as typed errors to be mapped by `MessageCommands`; other definite or ambiguous setup failures return `null`, because setup alone never publishes member content.

- [ ] **Step 4: Implement authoritative persona and plain fallback helpers**

  Normalize the member display name to one line, remove control characters, collapse whitespace, escape `\\`, `*`, `_`, `~`, `` ` ``, and `|` for fallback Markdown, and bound it before adding the wrapper. Use the guild display name, then Discord username, then `Discord member`. The webhook username is independently bounded to Discord's accepted length, and the avatar uses `member.displayAvatarURL(...)` without leaving the gateway.

  ```ts
  export function safePersona(member: GuildMember): { username: string; avatarURL?: string };
  export function attributedContent(member: GuildMember, content: string): string;
  ```

- [ ] **Step 5: Integrate preferred webhook dispatch into `MessageCommands`**

  Change actor authorization to remain `ViewChannel + SendMessages`, then calculate bot route availability as:

  ```ts
  const webhookAllowed = has(bot, ViewChannel, ManageWebhooks);
  const fallbackAllowed = has(bot, ViewChannel, SendMessages);
  const canSend = actorAllowed && (webhookAllowed || fallbackAllowed);
  ```

  Resolve and execute the relay first when authorized. Execute with `wait` semantics through the configured Discord client REST/dispatch context, using the authoritative persona and `{ parse: [] }`. Bot fallback is allowed only before execution or when the captured Discord response proves non-acceptance and is not `429`. After possible dispatch, return `MESSAGE_ACTION_UNCERTAIN`; do not fallback or replay. Invalidate cached `401`/`404` relays.

  ```ts
  await webhook.send({
    content,
    username: persona.username,
    avatarURL: persona.avatarURL,
    allowedMentions: { parse: [] },
  });
  ```

  The bot fallback retains the existing nonce guarantee and sends `attributedContent(actor, content)`.

- [ ] **Step 6: Wire lifecycle cleanup and run focused checks**

  `DiscordVoiceService.stop()` clears the relay, channel deletion invalidates that channel's cache entry, and guild deletion invalidates every cached entry owned by that guild. Add the focused test file to the gateway `test` script.

  Run:

  ```bash
  pnpm exec vitest run apps/gateway/src/managed-webhook-relay.test.ts
  pnpm --filter @dmap/gateway typecheck
  ```

  Expected: focused tests and gateway typecheck pass.

- [ ] **Step 7: Commit Task 1**

  ```bash
  git add apps/gateway/src/managed-webhook-relay.ts apps/gateway/src/managed-webhook-relay.test.ts apps/gateway/src/message-commands.ts apps/gateway/src/discord.ts apps/gateway/package.json
  git commit -m "feat: send Discord messages with member personas"
  ```

---

### Task 2: Durable member slowmode and retry deadlines

**Files:**

- Modify: `src/domain/messages/protocol.ts`
- Modify: `src/domain/discord/source.ts`
- Modify: `src/domain/discord/source-schema.ts`
- Modify: `src/domain/discord/constants.ts`
- Modify: `src/domain/discord/live-protocol.ts`
- Modify: `src/domain/presence/protocol.ts`
- Modify: `apps/gateway/src/source-adapter.ts`
- Modify: `apps/gateway/src/message-commands.ts`
- Modify: `apps/gateway/src/discord.ts`
- Modify: `worker/voice/discord-gateway-bridge.ts`
- Modify: `worker/live-world/coordinator.ts`
- Modify: `worker/presence/guild-presence.ts`
- Create: `worker/messages/member-slowmode.ts`
- Modify: `src/features/world/presence/world-presence-client.ts`
- Modify: `src/features/world/RoomChat.tsx`
- Create: `apps/gateway/src/message-commands.test.ts`
- Modify: `apps/gateway/package.json`
- Create: `tests/integration/worker/member-slowmode.test.ts`

**Interfaces:**

- Consumes: current live-source channel policy, an opaque member identifier `m_<43 base64url chars>`, current `rateLimitPerUser`, Discord's `BypassSlowmode` bit `1n << 52n`, and existing `MESSAGE_RATE_LIMITED` outcomes.
- Produces: `MessageSlowmodePolicy` with `{ actorKey, roomKey, intervalMs, bypass }`, `MemberSlowmode.run(policy, operation)`, optional `{ actorKey, nextAllowedAt }` observations on the server-only `guild-message` event, and the `message-persona-v1` gateway capability.

- [ ] **Step 1: Add focused failing protocol and cooldown behavior checks**

  Add cases proving: a non-exempt member is rejected until the reserved deadline; bypass permission skips the check; applied and uncertain operations keep their reservation while a definite rejection rolls it back; a native member message is forwarded with only an opaque actor key; lost/recovered coverage blocks for one current channel interval; and the browser rejection retains `retryAt`.

  ```ts
  expect(result).toMatchObject({
    type: 'live-error',
    error: { code: 'MESSAGE_RATE_LIMITED', status: 429, retryAt: 12_000 },
  });
  expect(serverEvent.slowmode.actorKey).toMatch(/^m_[A-Za-z0-9_-]{43}$/u);
  expect(JSON.stringify(serverEvent)).not.toContain(userId);
  ```

- [ ] **Step 2: Run only the affected tests and confirm the new contract fails**

  Run:

  ```bash
  pnpm exec vitest run apps/gateway/src/message-commands.test.ts
  pnpm exec vitest run --config vitest.worker.config.ts tests/integration/worker/member-slowmode.test.ts
  ```

  Expected: FAIL because the live-source slowmode policy, durable reservation, and capability do not exist.

- [ ] **Step 3: Add slowmode to the live source and capability contract**

  Add `rateLimitPerUser: number` constrained to Discord's `0..21_600` seconds to each live channel source, populating Discord API `rate_limit_per_user` and Discord.js `channel.rateLimitPerUser`, with `0` for channel kinds that cannot define it. Add the Worker policy bit:

  ```ts
  export const BYPASS_SLOWMODE = 1n << 52n;
  ```

  Extend the hello capability tuple with `message-persona-v1`. Message reads may still use `message-v1`, but the bridge accepts `message-send` only from a gateway advertising the persona capability. The live channel schema may parse a missing slowmode field as `0` solely for Worker-first compatibility; capability gating prevents that default from authorizing an old gateway send. Add `retryAt?: number` only to rejected browser `message-send-result` frames.

- [ ] **Step 4: Implement the Durable Object slowmode owner**

  Create `MemberSlowmode` around `DurableObjectState.storage`:

  ```ts
  export type MessageSlowmodePolicy = {
    actorKey: string;
    roomKey: string;
    intervalMs: number;
    bypass: boolean;
  };

  export class MemberSlowmode {
    public run<T extends { status: 'applied' | 'uncertain' }>(
      policy: MessageSlowmodePolicy,
      operation: () => Promise<T>,
    ): Promise<T>;
    public observe(actorKey: string, roomKey: string, nextAllowedAt: number): Promise<void>;
    public setCoverage(online: boolean, at?: number): Promise<void>;
    public prune(): Promise<void>;
  }
  ```

  Serialize by `roomKey:actorKey`. For non-bypass policies, reject an active stored/coverage deadline with `WorldAccessError('MESSAGE_RATE_LIMITED', 429, retryAt)`, persist a provisional `now + intervalMs` reservation before dispatch, keep it for applied or uncertain results, and restore the prior record after any definite thrown rejection. Use one storage key per opaque pair, schedule the Durable Object alarm for expiry pruning, and never evict an active record in a way that permits a send.

- [ ] **Step 5: Derive policy and integrate reservations in `GuildPresence`**

  Add `LiveWorldCoordinator.messageSlowmodePolicy(actor, subscriptionId, roomKey)`. It performs the existing connected read and room authorization, maps the raw actor to `IdentifierFactory.for('member', actor.userId)`, reads the channel's current interval from the live source, and evaluates `BYPASS_SLOWMODE` against `sourceForMember(...)`.

  ```ts
  const result = await this.slowmode.run(policy, () =>
    this.coordinator.sendMessage(actor, attachment.subscriptionId, command.input),
  );
  ```

  Feed coverage loss/resume into `MemberSlowmode` from both live-service transitions and `world-health` frames. Add `GuildPresence.alarm()` to prune expired records. When returning a rejected result, propagate `WorldAccessError.retryAt` through the presence protocol. `MessageRequestError` stores it, and `RoomChat` shows `Try again in <N>s` for an active deadline.

- [ ] **Step 6: Forward native Discord observations in the ordered guild lane**

  Extend `guild-message` with optional `{ actorKey, nextAllowedAt }`, where `actorKey` matches `^m_[A-Za-z0-9_-]{43}$`. `DiscordVoiceService.publishGuildMessage()` includes it only for native non-bot/non-webhook members in a slowmode channel, deriving the key through the identifier factory and the deadline from the message timestamp. Route the event through `DiscordGatewayBridge.ordered(guildKey, ...)`; a failed observation delivery deactivates coverage rather than silently keeping it trusted. `GuildPresence.receiveRoomMessage()` advances the ledger before broadcasting the unchanged `RoomMessage`.

  Do not add actor keys, raw IDs, deadlines, or provider avatar URLs to `RoomMessage` or browser frames.

- [ ] **Step 7: Run focused checks and commit Task 2**

  Run:

  ```bash
  pnpm exec vitest run apps/gateway/src/message-commands.test.ts
  pnpm exec vitest run --config vitest.worker.config.ts tests/integration/worker/member-slowmode.test.ts
  pnpm typecheck
  ```

  Expected: affected tests and all TypeScript projects pass.

  ```bash
  git add src/domain/messages/protocol.ts src/domain/discord/source.ts src/domain/discord/source-schema.ts src/domain/discord/constants.ts src/domain/discord/live-protocol.ts src/domain/presence/protocol.ts apps/gateway/src/source-adapter.ts apps/gateway/src/message-commands.ts apps/gateway/src/message-commands.test.ts apps/gateway/src/discord.ts apps/gateway/package.json worker/voice/discord-gateway-bridge.ts worker/live-world/coordinator.ts worker/presence/guild-presence.ts worker/messages/member-slowmode.ts src/features/world/presence/world-presence-client.ts src/features/world/RoomChat.tsx tests/integration/worker/member-slowmode.test.ts
  git commit -m "feat: preserve Discord member slowmode"
  ```

---

### Task 3: Message limit, installation guidance, and integrated verification

**Files:**

- Modify: `src/domain/messages/protocol.ts`
- Modify: `docs/setup/discord-application.md`
- Modify: `docs/deployment/discord-gateway-vps.md`

**Interfaces:**

- Consumes: Task 1's webhook/fallback routing and Task 2's compatible Worker-first protocol.
- Produces: a 1,900-character shared input/composer limit and deployment instructions for `Manage Webhooks`, Worker-first rollout, and gateway restart.

- [ ] **Step 1: Change the shared send maximum**

  Set:

  ```ts
  export const MESSAGE_SEND_MAX_LENGTH = 1_900;
  ```

  `RoomChat` already imports this constant for `maxLength` and its remaining counter, so do not duplicate the value in JSX. Retain the 4,000-character received-history bound.

- [ ] **Step 2: Document required permissions and rollout order**

  Explain that Administrator already includes `Manage Webhooks`; least-privilege installs need `View Channels`, `Read Message History`, `Send Messages`, `Manage Webhooks`, and the existing voice permissions. State that missing `Manage Webhooks` uses the visibly attributed bot fallback. Document Worker deployment before gateway update, then `git pull --ff-only`, production install, gateway restart, and status/log inspection.

- [ ] **Step 3: Run the proportionate integrated verification**

  Run:

  ```bash
  pnpm --filter @dmap/gateway test
  pnpm typecheck
  pnpm lint
  pnpm exec prettier --check apps/gateway/src src/domain/messages src/domain/discord src/domain/presence worker src/features/world docs/setup/discord-application.md docs/deployment/discord-gateway-vps.md
  pnpm build
  ```

  Expected: all commands exit `0`. Do not open a browser, deploy, restart services, or contact Discord.

- [ ] **Step 4: Commit Task 3**

  ```bash
  git add src/domain/messages/protocol.ts docs/setup/discord-application.md docs/deployment/discord-gateway-vps.md
  git commit -m "docs: configure Discord persona relay"
  ```
