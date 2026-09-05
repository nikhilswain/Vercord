# Discord sender persona for Dmap messages

Status: approved in chat on 2026-09-06; implementation plan not yet written.
Baseline: `e11e2a1` (`feat: add live Discord room messaging`).

## 1. Decision and scope

Messages submitted from a Dmap text room should resemble the authenticated Discord member who
submitted them without automating that member's Discord account. The VPS gateway remains the only
owner of Discord writes. It will prefer a Dmap-managed incoming webhook and override that webhook's
username and avatar with the actor's current guild display name and Discord avatar.

Discord will continue to identify these as application/webhook messages. Dmap must not hide or
imitate Discord's `APP` marker, request user-account message scopes, expose an OAuth token to the
browser, or automate a normal user account. The gateway derives the actor from the authenticated
server command and reads the member identity from Discord; the browser never submits a trusted
display name or avatar URL.

This change includes automatic webhook discovery/creation, an in-memory webhook cache, a plain bot
fallback, safe dispatch outcomes, and the permissions/setup documentation required by that flow. It
does not add a server settings screen, message editing/deletion, attachments, replies, reactions,
mention delivery, persistent message storage, or manual webhook configuration.

## 2. Visible behavior

The preferred Discord message uses:

- the actor's current server display name as the webhook username;
- the actor's current guild avatar, falling back to their Discord avatar when available;
- the submitted text as the message body; and
- Discord's normal application/webhook marker as the honest source indicator.

If webhook delivery is unavailable before any message dispatch, Dmap sends once as the bot using a
plain prefix:

```text
**ZERO says:**
hello everyone
```

The fallback name is the same current guild display name, normalized to one line and escaped so it
cannot alter the Markdown wrapper. It is text, not a Discord mention, and therefore does not ping the
member. Existing `allowed_mentions` suppression remains in both paths so user-entered mention syntax
does not create notifications.

Dmap's room panel continues to show Discord's confirmed message event/result. A webhook message's
visible author is the overridden webhook identity; a fallback message remains visibly authored by
the Dmap bot and retains the `NAME says:` attribution in its content.

## 3. Webhook ownership and lifecycle

Use one reusable incoming webhook per Discord text/announcement channel and name it `Dmap Relay`.
Create it lazily on the first Dmap send so ordinary browsing and message history reads never create
Discord resources. The bot performs all setup; server owners do not paste URLs or tokens into Dmap.

On a cache miss, serialize setup per channel, fetch the channel's webhooks, and reuse only an incoming
webhook whose creator is the current Dmap bot and whose name matches the managed name. A matching name
owned by someone else is never trusted. If none exists, create one with an audit-log reason that says
it is the Dmap message relay. Never delete, rename, or repurpose unrelated webhooks.

Treat setup as three states: usable, definitely unavailable, or ambiguous. If a create request has an
ambiguous outcome, do not create another relay immediately or on the next send. Mark the channel as
needing discovery; the next attempt must fetch its webhooks and resolve whether the first create
succeeded before any further create call. Creation alone does not publish the member's message, so a
bot fallback remains safe after an ambiguous setup outcome.

Cache the usable webhook object/token only in gateway memory. Do not send webhook credentials over
the Worker bridge, store them in D1/KV, expose them to the browser, or write them to logs. After a
gateway restart, safely rediscover the bot-owned channel webhook. Invalidate a cached entry when
Discord definitively reports that it no longer exists or cannot be used; a later send may rediscover
or recreate it.

Concurrent first sends for the same channel share one setup promise, preventing duplicate relay
creation. Bound the cache to known guild channels and discard entries on channel deletion, bot guild
removal, or gateway shutdown. Discord remains authoritative if an administrator deletes the relay.

## 4. Authorization and permissions

Every send keeps the current server-side authorization checks:

1. The Dmap session determines the raw Discord actor ID server-side.
2. The gateway confirms the guild, supported channel, current member, screening/timeout state, and
   the member's effective `ViewChannel` plus `SendMessages` permissions.
3. For webhook mode, the bot must have effective `ViewChannel` and `ManageWebhooks` permissions in
   that channel. For fallback mode, it must have effective `ViewChannel` and `SendMessages`.
4. Discord still enforces the permissions and channel state when the API call executes.

The message-history response's `canSend` value must follow the same routing rules. It is true only
when the actor may send and at least one server-owned delivery route is currently authorized: either
the managed webhook route or the attributed bot fallback. It must not remain coupled only to the bot's
`SendMessages` permission once webhook delivery exists.

The current administrator installation already satisfies these permissions. The least-privilege
setup documentation and generated invite permissions must include Manage Webhooks for preferred
sender personas. Missing Manage Webhooks is not fatal: Dmap uses the attributed bot fallback if the
bot can send normally. If neither path is permitted, return the existing typed bot-forbidden result.

An existing webhook token must not be treated as permission to bypass a later administrator change.
The gateway re-evaluates current bot permissions before using the cached relay.

## 5. Slowmode semantics

Discord bots and webhook executions are not naturally held to an ordinary member's per-user
slowmode. Dmap must therefore enforce the channel's `rateLimitPerUser` interval for the authenticated
actor unless that actor has the effective `BypassSlowmode` permission. This check happens before
either delivery route so switching from webhook to bot cannot bypass it.

Keep the next allowed send time in the per-guild Durable Object's storage, keyed by opaque room and
actor identifiers. Never expose or persist a raw Discord member ID for this ledger. Advance the
cooldown whenever delivery is confirmed or becomes uncertain, because Discord may already have
accepted the message. A definite pre-dispatch rejection does not consume the cooldown.

Gateway message events for native member messages also advance the actor's Dmap cooldown while the
gateway is connected. If event coverage is interrupted, ordinary members in a slowmode channel fail
closed until one channel interval has passed since coverage resumed; the UI returns the existing
typed rate-limit result and retry deadline. This conservative recovery prevents a gateway restart or
outage from becoming a slowmode bypass. Members with `BypassSlowmode` are unaffected.

## 6. Dispatch state machine and duplicate safety

Webhook setup and message dispatch are separate phases. Fallback is allowed only while the system
knows that no webhook message was accepted:

1. Resolve the actor and channel and authorize the actor.
2. Attempt managed-webhook discovery/creation.
3. If setup is unavailable or definitively rejected before executing the webhook, authorize the bot
   send path and dispatch the attributed fallback once.
4. If Discord's webhook execution response proves that the message was rejected and was not rate
   limited, it is safe to use the fallback once. Invalidate a definitely missing or invalid cached
   webhook first. A generic `4xx` classification alone is not sufficient proof.
5. Once webhook transport might have reached Discord, a network error, timeout, connection loss, or
   server error is `uncertain`. Do not send the bot fallback and do not replay automatically.
6. Request Discord confirmation for webhook execution and return the normalized created message only
   after a confirmed response.

Run webhook execution through the same guarded dispatch context used by bot sends so request expiry,
bridge ownership changes, response status, and the moment bytes may have left the process all inform
the final outcome. Do not call the Discord REST client outside that boundary.

Keep the existing request correlation and in-process outcome cache. Webhook execution does not offer
the bot create-message nonce guarantee, so the browser and bridge must continue never to retry an
uncertain send. A gateway process crash can prevent a durable exactly-once guarantee; the UI retains
the draft and tells the member to inspect Discord before manually trying again.

Discord rate limits remain typed outcomes with the real retry deadline. Do not route around a known
webhook rate limit by switching to the bot endpoint. Normal successful sends should complete in the
existing live-command request window; timeout behavior remains a failure path, not an intentional
delay.

## 7. Content limits and normalization

Use the same normalized user content in both dispatch paths. Reserve enough of Discord's 2,000
character message limit for the fallback prefix by setting Dmap's composer limit to 1,900 characters.
Reject oversized input before it reaches the gateway; do not truncate a submitted message silently.

Normalize the fallback display name to a single line, remove control characters, cap it to a bounded
length, and escape Discord Markdown. If the guild display name is unexpectedly unusable, use the
member's Discord username and finally the neutral label `Discord member`. The webhook username follows
Discord's accepted username constraints and uses the same fallback chain. Avatar lookup stays inside
the gateway and falls back to the relay's default avatar when no usable member avatar URL exists.

Continue sending `allowed_mentions: { parse: [] }`. Do not render arbitrary user URLs as webhook
credentials, place identity data in audit logs, or log message content.

## 8. Live delivery and errors

Both bot and webhook sends generate Discord message events. Normalize either through the existing
`RoomMessage` boundary and deduplicate the command result and Gateway event by the opaque message ID.
No raw Discord snowflake, webhook ID/token, or provider avatar URL is added to the browser protocol.

Keep the existing result categories:

- `applied`: Discord returned the created message;
- `rejected`: permissions, invalid input, cooldown, or another definite pre-dispatch failure; and
- `uncertain`: Discord may have accepted the webhook or bot write but no trustworthy confirmation
  reached Dmap.

Webhook setup failure followed by a confirmed bot fallback is `applied`, not a warning. A confirmed
webhook send followed by a failed live broadcast also remains applied; the initiating result can add
the message locally while reconnect/history reconciliation removes delivery gaps.

Operational telemetry may record the dispatch mode (`webhook` or `bot-fallback`), phase, result,
duration, numeric Discord status, and a one-way request correlation. It must never contain message
content, member names, avatars, raw guild/channel/member IDs, webhook credentials, or bot tokens.

## 9. Implementation and acceptance boundaries

The implementation should extend the gateway message-command owner rather than adding a browser or
Worker webhook API. Keep webhook lifecycle in a focused gateway helper so permission checks,
credential handling, and setup serialization are independently reviewable. Update the shared message
length schema and composer counter together.

Focused checks should cover:

- existing bot-owned relay reuse and concurrent first-send coalescing;
- no reuse of a foreign same-name webhook;
- webhook username/avatar selection from the authoritative guild member;
- missing Manage Webhooks taking the attributed bot fallback exactly once;
- webhook success returning the normalized message;
- ambiguous webhook creation forcing discovery before another create;
- definite non-acceptance permitting one fallback;
- rate limit and post-dispatch uncertainty never triggering fallback/replay;
- member slowmode shared across routes and consumed by applied or uncertain sends;
- slowmode recovery after lost gateway event coverage failing closed for one interval;
- Markdown/control-character-safe fallback attribution within the content limit; and
- result/event deduplication for webhook messages.

Run focused gateway tests, typecheck, lint, formatting checks, and a production build. Do not send a
real Discord message from automated checks. The user will manually verify both the webhook appearance
and forced bot fallback in a disposable channel. Deploying the Worker or restarting the production VPS
gateway remains a separate user-directed step.

## Sources

- [Discord webhook resource](https://docs.discord.com/developers/resources/webhook)
- [Discord message resource](https://docs.discord.com/developers/resources/message)
- [Discord channel resource](https://docs.discord.com/developers/resources/channel)
- [Discord OAuth2 and permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions)
- [Discord permission flags](https://docs.discord.com/developers/topics/permissions)
- [Discord automated user-account policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots)
