# Dmap

Dmap is building a visual world from a Discord server. Phase 1 establishes a private, minimized
structural source of truth; public and member projections remain unimplemented later phases.

The local MVP is one React application and one Cloudflare Worker source tree. The Worker is the
Discord bot backend; no separate always-running bot service is required. Phase 1 does not deploy
the Worker, enable a Cron Trigger, or expose a snapshot reader.

## Start here


## Phase 1 verifier implementation

- [Terminal-safe private inventory formatter](scripts/discord/format-inventory.ts)
- [Explicit local access verifier](scripts/discord/verify-access.ts)
- [Formatter privacy tests](tests/unit/domain/discord/format-inventory.test.ts)

Run the verifier only from a trusted local terminal with ignored `.dev.vars`; never run it in
CI, redirect it, screenshot it, or share its output because channel names may be private.

The original product brief remains available in
