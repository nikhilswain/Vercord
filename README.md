# Dmap

Dmap turns a Discord server into an explorable multiplayer pixel world. Server categories become
districts, supported channels become enterable rooms, and signed-in members can see one another move
through the same guild world in real time.

## 3D experiment

The `experiment/threejs-world` branch adds a playable low-poly Three.js renderer for the same
generated world. Open `/map/demo?renderer=3d` to explore the village and furnished rooms with animated
CC0 characters. Use **Pixel 2D** in the world HUD to compare with the original Phaser renderer.

See [THREEJS_EXPERIMENT.md](THREEJS_EXPERIMENT.md) for the map/character pipeline, controls,
implementation notes, validation, and current limits.

## What works

### 2D RPG samples

On `feat/2d-rpg-samples`, open `/play/demo` for Willowmere or `/play/demo?theme=norse` for
Frosthavn, a Norse/fantasy village with timber houses, stone lanes, a smithy, rune grove and longboat
landing. The menu switches between the two world themes. Each has an entrance to the Lantern Vault;
the dungeon stairs return to the settlement you came from. `/play/demo?theme=dungeon&from=norse`
opens the vault with Frosthavn as its return destination (omitting `from` returns to Willowmere).
These are fixed local art/interaction samples:
taller dressed characters with idle, walk and run animations, NPC dialogue, landmark interactions,
and themed HUDs. Move with WASD/arrows, hold Shift to run, double-click/tap to auto-run faster, and press E
near a character or landmark. Touch controls, appearance selection and a map are available in the HUD.

The implementation lives in `src/features/rpg/`: `sample-worlds` owns scene data, `simulation`
owns movement and interactions, `character` owns layered animation, `sample-renderer` owns scenery,
`rpg-scene` connects Phaser to those modules, and `RpgDemoPage` owns React UI. Static ground is baked
once per scene load; collision checks use a spatial index; HUD state is deduplicated and capped at
10 updates per second. Textures are shared across characters and theme changes.

`themes` owns destination labels, travel context and each village's traveler choices. Rowan/Ash
belong to Willowmere; Ivar/Sigrid wear the Norse outfits. Your selection follows you underground
and is remembered per village during the current visit. `samples/norse-props` pairs each original
building/prop with its collision base and depth anchor. Reproduce the original scenery with
`node scripts/generate-norse-buildings.mjs` and `node scripts/generate-norse-ground.mjs`.

The fixed art samples remain separate from saved server towns. The existing 2D and Three.js demos
remain at `/map/demo`.

### Saved server towns

After signing in and syncing a connected server, choose **Explore town** on its dashboard card.
`/play/:guildId` opens its saved village; `?theme=norse` opens its saved Norse town. The menu and
dungeon portals preserve the current server and return settlement. The guide NPC and scenery belong
to the game; the signed-in Discord member is the traveler.

Each server has one map per overworld theme. First entry reserves a unique D1 `world_instances` row,
assembles authored landmark plots around connected roads, validates movement clearances, then saves
the complete scene documents with their seed, content/generator versions, revision and checksum.
Simultaneous visits converge on the same saved output. Reloads, Discord syncs, channel changes and
permission differences never move its terrain or buildings. The existing Lantern Vault is saved
alongside each town; procedural dungeon topology remains a later addition.

Membership is checked through the existing guild coordinator before initialization and again before
returning the saved map. Only authorized channel names appear in landmark directories; channel
bindings are projected separately from shared geometry. The **Open connected rooms** link retains the
existing live presence, voice and chat experience. Those live spatial systems are not yet attached
to the new RPG scene coordinates.

`src/domain/world/` owns renderer-independent documents, generation, validation and the pinned v1
content catalog; `worker/worlds/` owns storage and channel binding projection. The RPG adapter loads
stored geometry without running a generator in the browser. Preserve released content versions and
their asset files when introducing future generators. Invalid or unsupported saves report a loading
error rather than being replaced. There is no reroll/editor control; map editing and player
position/progression saves remain future scope.

Apply the additive local migration with `pnpm db:migrate:local` before opening a saved town. Normal
local use requires `pnpm dev` and the Discord Gateway, as described below. No additional bindings or
Gateway protocol changes are needed.

Imported LPC art and font notices are linked in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Connected world

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
   http://localhost:3000/api/auth/discord/callback
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

6. Open `http://localhost:3000`, sign in with Discord, and sync a connected server from the
   dashboard. `pnpm discord:verify` can be used to inspect what the bot can see before syncing.

If you use another port, for example `pnpm dev --port 3002 --strictPort`, register
`http://localhost:3002/api/auth/discord/callback` in Discord and set
`DMAP_BRIDGE_URL=ws://localhost:3002/api/internal/discord-gateway` in `.dev.vars`. Restart the
Gateway after changing that URL; its logs should show `discord_ready` and `bridge_connected`.
The server list can load even when the Gateway is disconnected, but opening a town needs it.

Run one Vite dev server per checkout: multiple instances share the dependency cache. If requests
fail with a missing file under `node_modules/.vite`, stop the extra instances and restart the app
with `pnpm dev --port 3002 --strictPort --force` (using your chosen port). This rebuilds the
dependency cache without changing saved maps. Use **Explore town** or `/play/:guildId` for saved
RPG towns; `/world/:guildId` opens the older connected world.

To try voice movement, manually join any voice channel in the Discord client once, then enter a
mapped voice room in Dmap. Dmap can move or disconnect an existing Discord voice connection, but a
bot cannot connect your Discord client to voice after you disconnect.

## Discord permissions

Install the application bot in each server you want Dmap to manage with the `Administrator`
permission (`permissions=8`). This is an explicit convenience tradeoff: the server owner gets a
single install choice instead of configuring private-channel overrides individually. The Gateway
uses `Guilds`, `Guild Voice States`, `Guild Members`, `Guild Messages`, and `Message Content`.
Enable the privileged Server Members and Message Content intents in the application portal. OAuth
identifies the signed-in member, and the Gateway checks the member and bot's current channel
permissions immediately before every voice, channel, or message action.

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
