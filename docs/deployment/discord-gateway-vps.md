# Discord Gateway on an Ubuntu VPS

This guide runs Dmap's Discord Gateway permanently on an Ubuntu VPS. It uses NVM for Node.js,
pnpm for dependencies, and systemd to keep the process running after SSH disconnects, crashes, and
server reboots.

The instructions below match the first production setup:

| Item              | Value                            |
| ----------------- | -------------------------------- |
| VPS provider      | DigitalOcean                     |
| Operating system  | Ubuntu 24.04, x86_64             |
| Linux user        | `sudi`                           |
| Repository root   | `/home/sudi/zero/Vercord`        |
| Gateway source    | `apps/gateway`                   |
| systemd unit      | `dmap-gateway.service`           |
| Node.js           | NVM-managed Node 24              |
| Production Worker | `https://dmap.ze-ro.workers.dev` |

Replace the example username and paths if a future server uses different values.

## What runs where

The repository is a monorepo with two separate production runtimes:

```text
Vercord/                         one Git repository
├── apps/
│   └── gateway/                runs continuously on the VPS
├── src/                        shared client and protocol code
├── worker/                     runs on Cloudflare Workers
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

Clone the entire repository onto the VPS. Do not copy only `apps/gateway`: the Gateway imports
shared protocol code from `src/` and uses the root pnpm workspace and lockfile.

The VPS process needs no public domain, inbound port, reverse proxy, or TLS certificate. It opens
outbound connections to Discord and to the Cloudflare Worker.

## Before starting

The Cloudflare Worker must already have:

- the `DISCORD_GATEWAY_BRIDGE` Durable Object binding;
- the `v2` `DiscordGatewayBridge` migration;
- a runtime secret named `GATEWAY_BRIDGE_SECRET`;
- a successful deployment containing the voice bridge code.

Keep these four Gateway values available on the trusted development machine:

```dotenv
DISCORD_BOT_TOKEN=<Discord-application-bot-token>
SNAPSHOT_ID_SECRET=<exact-value-used-by-the-Worker>
GATEWAY_BRIDGE_SECRET=<exact-value-used-by-the-Worker>
DMAP_BRIDGE_URL=wss://dmap.ze-ro.workers.dev/api/internal/discord-gateway
```

Never paste secret values into chat, screenshots, Git, shell history, or a public issue.

## 1. Clone the repository

Clone the full repository into any folder owned by the deployment user. The folder does not have
to be `/opt`; its absolute path only needs to remain stable.

```bash
mkdir -p /home/sudi/zero
cd /home/sudi/zero
git clone --depth 1 <repository-url> Vercord
cd /home/sudi/zero/Vercord
pwd
```

The expected final path for this server is:

```text
/home/sudi/zero/Vercord
```

## 2. Inspect the server

These commands do not change the server. They confirm the user, repository path, architecture,
Linux version, service manager, and existing JavaScript tools.

```bash
whoami
pwd
uname -m
grep -E '^(NAME|VERSION_ID)=' /etc/os-release
systemctl --version | head -n 1
node --version
command -v nvm
command -v pnpm
```

Dmap Gateway requires Node.js 24 or newer. The original VPS had system Node 18, so Node 24 was
installed for `sudi` with NVM without replacing the system version.

## 3. Install NVM, Node 24, and pnpm

Install NVM as the normal Linux user, without `sudo`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.6/install.sh | bash
```

Reload the current shell. Use the file that matches the shell:

```bash
source ~/.zshrc
```

For Bash, use `source ~/.bashrc` instead.

Install and select Node 24:

```bash
nvm install 24
nvm alias default 24
nvm use 24
```

Install the exact pnpm version declared by the repository. Do not use `sudo` for packages installed
inside NVM:

```bash
npm install --global pnpm@11.24.0
```

Verify the result:

```bash
node --version
npm --version
pnpm --version
nvm which 24
command -v pnpm
```

The first production VPS returned:

```text
v24.20.0
11.19.0
11.24.0
/home/sudi/.nvm/versions/node/v24.20.0/bin/node
/home/sudi/.nvm/versions/node/v24.20.0/bin/pnpm
```

## 4. Install production dependencies

Run the install from the repository root:

```bash
cd /home/sudi/zero/Vercord
pnpm install --prod --frozen-lockfile
```

The flags have small, deliberate jobs:

- `--prod` skips test, lint, and other development-only dependencies.
- `--frozen-lockfile` installs the exact versions in `pnpm-lock.yaml` and refuses to rewrite it.

The root workspace may still install frontend production packages such as React and Phaser. The
Gateway does not load or execute them; they only consume some VPS disk space.

## 5. Create the protected Gateway environment file

Keep Gateway secrets outside the repository:

```bash
mkdir -p /home/sudi/.config/dmap
chmod 700 /home/sudi/.config/dmap
vim /home/sudi/.config/dmap/gateway.env
```

In Vim, press `i`, enter the following lines with real values, press `Esc`, type `:wq`, and press
Enter:

```dotenv
DISCORD_BOT_TOKEN=<actual-token>
SNAPSHOT_ID_SECRET=<actual-secret>
GATEWAY_BRIDGE_SECRET=<actual-secret>
DMAP_BRIDGE_URL=wss://dmap.ze-ro.workers.dev/api/internal/discord-gateway
```

Rules for this file:

- remove the `<` and `>` placeholders;
- do not put spaces around `=`;
- use `wss://` in production, not `ws://` or `ws:https://`;
- `GATEWAY_BRIDGE_SECRET` must exactly match the Worker secret;
- `SNAPSHOT_ID_SECRET` must exactly match the Worker secret;
- keep `GATEWAY_BRIDGE_SECRET` different from `SNAPSHOT_ID_SECRET`.

Protect the file and inspect only its permissions and key names:

```bash
chmod 600 /home/sudi/.config/dmap/gateway.env
stat -c '%a %U:%G %n' /home/sudi/.config/dmap/gateway.env
cut -d= -f1 /home/sudi/.config/dmap/gateway.env
```

Expected output begins with:

```text
600 sudi:sudi /home/sudi/.config/dmap/gateway.env
```

The key-name check should print exactly:

```text
DISCORD_BOT_TOKEN
SNAPSHOT_ID_SECRET
GATEWAY_BRIDGE_SECRET
DMAP_BRIDGE_URL
```

Do not run `cat` on this file while recording, sharing a screen, or copying terminal output.

## 6. Prove the Gateway manually

Load the environment into only the current shell:

```bash
set -a
source /home/sudi/.config/dmap/gateway.env
set +a
```

Run the Gateway in the foreground:

```bash
cd /home/sudi/zero/Vercord
pnpm gateway:start
```

A healthy Gateway may remain quiet and keep the terminal occupied. That is normal. Wait about 15
seconds, then confirm:

- the bot appears online in Discord;
- the production world no longer says **Voice sync offline**;
- joining Discord voice and entering a mapped voice room works.

Press `Ctrl+C` after the manual proof. Do not leave this foreground process running when starting
the systemd service, or two Gateway processes will compete for the same bot and bridge connection.

If the `source` command contains `gateway.envsource`, it was pasted twice without a newline. Run the
`source` command once by itself.

## 7. Register the permanent systemd service

Record the paths that systemd must use:

```bash
whoami
pwd
nvm which 24
command -v pnpm
```

NVM is normally loaded only in interactive shells. A systemd unit therefore needs the exact NVM
binary directory in `PATH` and the exact pnpm path.

Create the unit:

```bash
sudo vim /etc/systemd/system/dmap-gateway.service
```

For the first production VPS, the complete unit is:

```ini
[Unit]
Description=Dmap Discord Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sudi
WorkingDirectory=/home/sudi/zero/Vercord
EnvironmentFile=/home/sudi/.config/dmap/gateway.env
Environment="PATH=/home/sudi/.nvm/versions/node/v24.20.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=/home/sudi/.nvm/versions/node/v24.20.0/bin/pnpm --filter @dmap/gateway start
Restart=always
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

When recreating this unit later, replace the username, repository path, Node directory, and pnpm
path with the outputs from that server.

In Vim, save with `Esc`, `:wq`, Enter. Validate the unit:

```bash
sudo systemd-analyze verify /etc/systemd/system/dmap-gateway.service
```

`systemd-analyze verify` can also print warnings from unrelated units. A warning naming another
service, such as `quickpoc-webdav.service`, does not mean the Dmap unit failed. Investigate any line
that specifically names `dmap-gateway.service`.

Load, enable, and start Dmap Gateway:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dmap-gateway
sudo systemctl status dmap-gateway --no-pager
```

`enable` starts the service after future VPS reboots. `--now` also starts it immediately.

## 8. Verify the permanent service

Verify current state, boot enablement, process ID, and restart count:

```bash
sudo systemctl is-active dmap-gateway
sudo systemctl is-enabled dmap-gateway
sudo systemctl show dmap-gateway -p MainPID -p NRestarts --no-pager
```

Healthy output looks like:

```text
active
enabled
MainPID=<non-zero-number>
NRestarts=0
```

Inspect recent logs:

```bash
sudo journalctl -u dmap-gateway -n 30 --no-pager
```

Follow new logs in real time:

```bash
sudo journalctl -u dmap-gateway -f
```

Stop a live log follow with `Ctrl+C`; this does not stop the service.

The first production verification showed an active, enabled service, a non-zero PID, zero restarts,
and no Gateway errors. The bot and production voice flow were also checked successfully.

Clear secrets loaded during the manual test from the interactive shell:

```bash
unset DISCORD_BOT_TOKEN SNAPSHOT_ID_SECRET GATEWAY_BRIDGE_SECRET DMAP_BRIDGE_URL
```

The SSH session can now be closed. systemd owns the process.

## 9. Run the production voice smoke test

1. Open `https://dmap.ze-ro.workers.dev` and sign in.
2. Open a synchronized private world.
3. Confirm **Voice sync offline** is absent.
4. Join any voice channel manually in the Discord client.
5. Enter the matching Dmap voice room and confirm the in-call state appears.
6. Leave the room and confirm the call stays active.
7. Use **Return** and confirm the avatar returns to the voice room.
8. Enter a different voice room and confirm Discord moves the existing call.
9. Change mute or deafen state in Discord and confirm Dmap mirrors it.
10. Use Dmap's confirmed **Disconnect** action and confirm the Discord call ends.

Dmap cannot create the user's initial Discord voice connection. The user joins once in Discord;
Dmap can then mirror, move, return, or disconnect that existing connection.

## Routine operations

### Check status

```bash
sudo systemctl status dmap-gateway --no-pager
```

### Restart

```bash
sudo systemctl restart dmap-gateway
```

### Stop and start

```bash
sudo systemctl stop dmap-gateway
sudo systemctl start dmap-gateway
```

### Deploy a Gateway code update

Cloudflare's GitHub build deploys only the Worker. Update the VPS separately whenever
`apps/gateway`, its shared protocol code, or its dependencies change. Deploy the compatible Worker
first, and wait for that deployment to succeed before updating the Gateway. This ordering lets the
new Worker accept both the existing Gateway protocol and the updated one during the rollout.

After the Worker deployment succeeds, update the VPS, install production dependencies, restart the
Gateway, and inspect both its status and recent logs:

```bash
cd /home/sudi/zero/Vercord
git pull --ff-only
nvm use 24
pnpm install --prod --frozen-lockfile
sudo systemctl restart dmap-gateway
sudo systemctl status dmap-gateway --no-pager
sudo journalctl -u dmap-gateway -n 50 --no-pager
```

### Upgrade the NVM-managed Node 24 patch release

The systemd unit contains the exact NVM version directory. After upgrading Node, update both the
`PATH` and `ExecStart` paths in the unit:

```bash
nvm install 24
nvm use 24
npm install --global pnpm@11.24.0
nvm which 24
command -v pnpm
sudo vim /etc/systemd/system/dmap-gateway.service
sudo systemctl daemon-reload
sudo systemctl restart dmap-gateway
```

Verify the service again after editing the paths.

## Troubleshooting

### `Voice sync offline`

Check the service and logs:

```bash
sudo systemctl status dmap-gateway --no-pager
sudo journalctl -u dmap-gateway -n 50 --no-pager
```

Then confirm:

- `DMAP_BRIDGE_URL` uses `wss://` and the exact production Worker hostname;
- `GATEWAY_BRIDGE_SECRET` matches the Worker;
- the Worker has the `DISCORD_GATEWAY_BRIDGE` binding and `v2` migration;
- the VPS can make outbound HTTPS/WSS connections;
- only one Gateway instance is running.

### `GATEWAY_CONFIG_INVALID`

One or more environment values are missing or malformed. Confirm the four key names without
printing their values. Both generated secrets must be different 43-character base64url strings.

### systemd reports `203/EXEC`

The `ExecStart` path is wrong or points to an NVM version that was replaced. Run:

```bash
nvm which 24
command -v pnpm
```

Update the unit's `PATH` and `ExecStart`, then reload and restart systemd.

### The bot is online but Dmap remains offline

The Discord connection succeeded, but the Worker bridge did not. Recheck the production `wss://`
URL and the exact matching `GATEWAY_BRIDGE_SECRET`, then restart the service.

### The terminal stays blank after `pnpm gateway:start`

This is normally healthy. The process intentionally logs errors rather than continuous success
messages. Check the Discord bot and Dmap UI before treating quiet output as a failure.

### Nano appears frozen

Press `Ctrl+Q` once in case terminal flow control was paused, then `Ctrl+X`. Vim is also available:
press `i` to edit, `Esc` to leave insert mode, and `:wq` plus Enter to save and exit.

## Security notes

- Keep `/home/sudi/.config/dmap/gateway.env` at mode `600`.
- Never commit the Gateway environment file or copy it into the repository.
- Never expose the bot token or either shared secret in logs or screenshots.
- Run the service as the unprivileged `sudi` user, not `root` or `nobody`.
- No inbound firewall rule is required for this process.
- Rotate a leaked secret immediately in both Cloudflare and the VPS, then restart the Gateway.
