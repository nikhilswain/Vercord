# Dmap

Dmap is building a visual world from a Discord server. Phase 1 established a private, minimized
structural source of truth. Phase 2 is building a fixture-backed interactive atlas; public and
member projections remain unimplemented later-phase work.

The local MVP is one React application and one Cloudflare Worker source tree. The Worker is the
Discord bot backend; no separate always-running bot service is required. Public publishing remains
disabled, and the Phase 2 browser never receives the private canonical snapshot.

## Start here


## Phase 1 verifier implementation

- [Terminal-safe private inventory formatter](scripts/discord/format-inventory.ts)
- [Explicit local access verifier](scripts/discord/verify-access.ts)
- [Formatter privacy tests](tests/unit/domain/discord/format-inventory.test.ts)

Run the verifier only from a trusted local terminal with ignored `.dev.vars`; never run it in
CI, redirect it, screenshot it, or share its output because channel names may be private.

The original product brief remains available in
