# Dmap

Dmap turns a Discord server into an explorable multiplayer pixel world. Server categories become
districts, supported channels become enterable rooms, and signed-in members can see one another move
through the same guild world in real time.

## What works

- Discord OAuth sign-in and guild access discovery
- Admin/owner dashboard with explicit guild synchronization
- Safe map projection from Discord categories and channels
- Stable guild URLs at `/world/:guildId`
- Phaser-powered movement, camera controls, collision, rooms, and minimap
- Live member presence over Cloudflare Durable Object WebSockets
- Real-time Discord voice-state mirroring with bot-assisted room moves and confirmed disconnect
- Cloudflare KV snapshots and D1-backed sessions/guild state

## Stack

React 19, TypeScript, Phaser 4, Vite, and one Cloudflare Worker containing the API, OAuth flow,
Discord synchronization, static application, KV/D1 access, presence, and the authenticated voice
bridge. `apps/gateway` is a small always-on Discord.js process: Discord remains the audio client and
the browser never needs a companion installation.

## Run locally

Requirements: Node.js 24+, pnpm 11+, a Discord application with a bot, and a Cloudflare account for
deployment.

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Copy `.dev.vars.example` to `.dev.vars` and fill in the Discord credentials and generated
   secrets. Never commit `.dev.vars`.

3. In the Discord developer portal, register this exact local OAuth redirect:

   ```text
   http://localhost:5173/api/auth/discord/callback
   ```

4. Set `GATEWAY_BRIDGE_SECRET` to the same fresh 32-byte base64url value used by both processes.
   Keep `SNAPSHOT_ID_SECRET` identical too; opaque guild/member/channel keys depend on it.

5. Apply the local D1 migrations and start the app:

   ```sh
   pnpm db:migrate:local
   pnpm dev
   ```

   In a second terminal, start the Gateway:

   ```sh
   pnpm gateway:dev
   ```

6. Open `http://localhost:5173`, sign in with Discord, and sync a connected server from the
   dashboard. `pnpm discord:verify` can be used to inspect what the bot can see before syncing.

To try voice movement, manually join any voice channel in the Discord client once, then enter a
mapped voice room in Dmap. Dmap can move or disconnect an existing Discord voice connection, but a
bot cannot connect your Discord client to voice after you disconnect.

## Discord permissions

Install the application bot in each server you want Dmap to manage with the `Administrator`
permission (`permissions=8`). This is an explicit convenience tradeoff: the server owner gets a
single install choice instead of configuring private-channel overrides individually. The Gateway
still uses only the standard `Guilds` and `Guild Voice States` intents; it does not need message
content or the privileged guild-members intent. OAuth identifies the signed-in member, and the
Gateway checks the connected member and destination immediately before every move.

## Deploy

Provision the KV, D1, and Durable Object bindings named in `wrangler.jsonc`, replace development
resource identifiers with your Cloudflare resources, set every required Worker secret, register the
production Discord OAuth callback, and set `GATEWAY_BRIDGE_SECRET` as a Worker secret. Deploy the
Worker first, then run `apps/gateway` on an always-on Node host with `DISCORD_BOT_TOKEN`,
`SNAPSHOT_ID_SECRET`, `GATEWAY_BRIDGE_SECRET`, and the deployed `wss://.../api/internal/discord-gateway`
as `DMAP_BRIDGE_URL`.

Then run:

```sh
pnpm db:migrate:remote
pnpm deploy
```

## Game assets

The repository ships the same CC0 art in development and production: Kenney Tiny Town for the
outdoor world, Kenney Tiny Dungeon for room interiors, Fleurman's Tiny Characters Set for animated
avatars, and Kenney RPG Urban Pack for the remaining legacy atlas. Source and license details are in
`THIRD_PARTY_NOTICES.md` and beside each published asset set under `public/game-assets/`.

## Useful commands

```sh
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm discord:verify
pnpm discord:sync
pnpm gateway:dev
pnpm gateway:start
```
