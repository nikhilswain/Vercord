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
- Cloudflare KV snapshots and D1-backed sessions/guild state

## Stack

React 19, TypeScript, Phaser 4, Vite, and one Cloudflare Worker containing the API, OAuth flow,
Discord synchronization, static application, KV access, D1 access, and Durable Object presence.
There is no separate always-running bot repository or process.

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

4. Apply the local D1 migrations and start the app:

   ```sh
   pnpm db:migrate:local
   pnpm dev
   ```

5. Open `http://localhost:5173`, sign in with Discord, and sync a connected server from the
   dashboard. `pnpm discord:verify` can be used to inspect what the bot can see before syncing.

## Discord permissions

Install the application bot in each server you want Dmap to manage. The bot only discovers channels
visible to its role. OAuth identifies the signed-in member and their manageable guilds; the bot token
performs server synchronization.

## Deploy

Provision the KV, D1, and Durable Object bindings named in `wrangler.jsonc`, replace development
resource identifiers with your Cloudflare resources, set every required Worker secret, register the
production Discord OAuth callback, then run:

```sh
pnpm db:migrate:remote
pnpm deploy
```

## Game assets

The repository includes Kenney Tiny Town and RPG Urban Pack art under CC0. See
`THIRD_PARTY_NOTICES.md`.

Some local development art is intentionally not redistributed: Mana Seed character layers and the
PixelSpaces interior pack. If you have your own licensed copies, place the prepared files under
`assets/runtime/game-assets/mana-seed/` and `assets/runtime/game-assets/pixel-lands/`, then set
`VITE_LOCAL_GAME_ASSETS=true` in `.env.development.local`. These files are served only by the local
development server and cannot enter a production build. Without them, Dmap uses its included CC0
avatar and drawn interior fallbacks.

## Useful commands

```sh
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm discord:verify
pnpm discord:sync
```
