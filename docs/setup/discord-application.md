# Discord Application Setup

These account-bound steps are performed by the Discord application owner. They prepare a server
for synchronization and Dmap's bot-assisted Discord voice flow; they do not deploy the Worker or
the always-on Gateway process.

## Create the application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create an application named **Dmap**.
3. Keep the Application ID for local installation work; it is not a secret.
4. On **Bot**, use the default bot user and generate its token.
5. Store the token in a password manager and in ignored local `.dev.vars` only.
6. Do not send the token through chat. Regenerate it immediately if it is exposed.

## Enable the required Gateway intents

On **Bot → Privileged Gateway Intents**, enable **Server Members Intent** and **Message Content
Intent**. Leave Presence Intent disabled. Server Members keeps world permissions current; Message
Content powers the bounded text-room message panel. Restart `apps/gateway` after changing intents.

## Configure the guild installation

1. On **Installation**, enable **Guild Install**.
2. Configure the Discord-provided install link with only the `bot` OAuth2 scope.
3. Under bot permissions, select **Administrator**. The exact permission integer is `8`.
4. Administrator already includes Manage Webhooks as well as the text and voice permissions Dmap
   needs, so no extra per-channel setup is needed. It is deliberately broad, so the Discord
   installer must clearly review and approve that tradeoff.
5. Open the install link and select the dedicated test server. The installer must have Discord's
   Manage Server permission.

Dmap appears online while `apps/gateway` is running. Synchronization accepts the Administrator
permission and uses it when determining which server channels can be mapped.

For a least-privilege installation instead of Administrator, grant **View Channels**, **Read
Message History**, **Send Messages**, **Manage Webhooks**, **Connect**, and **Move Members**.
Manage Webhooks lets Dmap relay messages with the member's display name and avatar. If it is missing
but the bot can still send in the channel, Dmap uses a visibly attributed bot fallback instead.

## Allow the intended private structure

Administrator bypasses private category and channel overwrites, so Dmap can map and move members
across the whole installed server. Server owners should install Dmap only when that scope is
acceptable.

## Compare access with Discord obfuscation

Use Discord's private-channel-obfuscation toggle in the Developer Portal while comparing the
private verifier inventory with Discord. Enable the toggle during the access comparison to
exercise the post-rollout behavior.

Until Discord's November 16, 2026 mandatory rollout, the guild-channel endpoint can return
metadata for channels the bot cannot effectively view. Dmap therefore evaluates permission
overwrites even when a channel is returned. With obfuscation enabled, and after the rollout,
Discord can omit or obfuscate inaccessible channels. Such omitted channels are unknowable to
the bot and cannot appear in the verifier, so compare the intended private categories and
channels explicitly rather than treating a clean run as proof that no other channels exist.

## Capture the test server ID and verify

Enable Developer Mode in Discord, right-click the test server, and choose **Copy Server ID**.
Store the value only in ignored local `.dev.vars`; do not commit or paste it into documentation.

After completing [local Discord configuration](local-development.md#local-discord-configuration),
run `corepack pnpm discord:verify` only in a trusted local terminal. Its labels can be private:
never run it in CI, redirect it, screenshot it, or share its output.
