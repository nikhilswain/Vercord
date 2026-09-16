# Native game chat

Open the game and press **T**, or choose **Chat** on the left. Discord room chat is
still available inside its existing channel houses; native chat never copies messages
to or from Discord.

## Scope

- **World:** everyone connected to native chat in the current server's world, across
  its areas and themes. Other servers have separate chat hubs.
- **Direct:** two travelers in that server. Start from the Direct traveler list;
  existing conversations remain available when the other traveler goes offline.
- **Party:** current members only. Membership is resolved on the server for history,
  sends and delivery. Choose a traveler in **Players**, then **Invite to party**.
  Invitations expire after two minutes and require the recipient's acceptance.
  A party has at most four members. Its HUD indicator below player identity opens party
  chat directly. The members icon beside Close reveals the roster; selecting a member
  opens a direct message with Back to party chat. Invite and Leave sit side by side. A traveler can belong to one party.
- **Demo:** Wren stands southwest of the arrival point in Willowmere and at the
  jungle arrival clearing. Approach and press E to request his invitation or message
  him directly. Players also offers this interaction. His replies are scripted. Demo chat is local to the current page
  session; it is not a shared public chat or a real player's account.

## Implementation boundaries

`src/domain/chat/protocol.ts` is the strict shared command/event contract.
`src/features/rpg/chat/client.ts` owns bounded transcripts, pending sends, unread
counts, request correlation and deduplication. `transport.ts` owns the socket,
heartbeat, backoff and teardown; `demo.ts` implements the same transport contract
for the NPC. The React panel subscribes separately from the world renderer.

`worker/http/game-chat.ts` derives identity from the existing HTTP-only Dmap login
cookie, rejects cross-origin upgrades and forwards only server-produced identity.
One `GameChat` Durable Object per server owns the sockets and SQLite message store.
`worker/chat/store.ts` isolates persistence so a later backend/database decision
does not require redesigning the UI or wire protocol. Wrangler migration **v3** adds
the `GAME_CHAT` binding; this does not change the existing D1 tables.

Native message delivery does not use Discord's message API or gateway. Access still
uses the game's existing server-membership authority. Admission checks the login
and membership; socket leases recheck them at most 30 seconds apart. Expired or
unverifiable leases cannot receive messages. A membership-service outage therefore
pauses access rather than granting stale permissions.

Party commands go through trusted invite/accept/decline/leave actions. Clients cannot
supply a roster or grant themselves membership. Accepting validates the recipient,
expiry, current memberships and capacity in one transaction. Replayed acceptance
does not add the player twice. Leaving revokes send/read access and publishes the
new roster so the client drops that party's cached transcript.

The **N online** button below player identity opens **Players**, listing connected
travelers across the server with their current
area and online/away state. Area labels are bounded, sanitized presentation supplied
by the game client, never an authorization input. Same-area travelers continue to
use the existing world presence renderer. Chat, Players and party details share one
non-modal panel on the left; focusing the world resumes movement without closing chat.
The native channel selector uses the platform's accessible option popup. Profiles
beyond currently available player details, friend lists and proximity bubbles remain
future features; unavailable actions are not shown.

The live connection bug was socket attachments being serialized as world actors.
The world's strict internal endpoint rejected those extra fields. Chat now forwards
only `guildId`, `userId` and `sessionHash` at admission and lease renewal.

## Delivery and limits

- Persist before acknowledging. Sender-generated request IDs are unique per sender;
  retrying one reconciles with the original message instead of creating a duplicate.
- Unconfirmed sends remain visible with **Retry message**. Drafts survive panel
  closure and transient disconnections in memory; they are not silently sent later.
- Ordered server sequence numbers, cursor history and heartbeat watermarks recover
  missed messages. A history gap after a long disconnection starts a fresh recent
  window with explicit earlier-page loading.
- Messages are plain text, up to 1,000 characters. No HTML or embedded attachments.
- Store up to 500 messages per conversation for up to seven days, whichever limit
  comes first. An hourly cleanup continues after all sockets disconnect.
- Fetch 50 messages at a time. Render at most 200 entries per conversation and keep
  at most 30 conversation buffers in browser memory.
- Each world currently allows 200 chat sockets, with four per account. Message and
  command limits apply across that account's tabs. Heartbeats run every 10 seconds;
  reconnect uses bounded exponential backoff and an explicit Reconnect action.
- Client caches are cleared on account changes or loss of private-room access.
  Message contents are never written to diagnostic logs.

## Verification

Worker tests cover the real world-authority request parser, multi-client delivery, server isolation, private-channel reads
and sends, invitation privacy/acceptance/replay/expiry/capacity, party removal, expired sessions, request deduplication, rate limits,
cursor history, retention, origin checks and cookie-derived Unicode identities.
Client tests cover replay merging, uncertain sends, stale replies, unread counts,
privacy-cache removal, heartbeat failures and socket teardown.

Real-browser checks exercise party invitations, Players search, all three chat
views, non-modal gameplay, input isolation from movement/combat, retained drafts and small screens.
Live friend testing uses two signed-in members of the same connected server.

## Deployment

Cloudflare Workers Builds deploys the `main` branch. The Worker deployment applies
the `v3` Durable Object migration in `wrangler.jsonc`, creating the `GAME_CHAT`
namespace. This release needs no additional D1 migration or new secrets.

The existing Discord gateway code and bridge protocol are unchanged; it can remain
running during this release. Native chat runs in the Worker, while Discord room
chat and voice continue through the existing gateway.
