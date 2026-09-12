# Game audio and settings

The shared RPG page owns background music for `/play/demo`, other RPG samples,
and saved server towns. Music continues across village/jungle travel, houses,
themes and game dialogs. Leaving the RPG page releases the player. It is separate
from Discord voice audio and from the Phaser scene/render loop.

## Choose the default

Edit `src/features/audio/music-catalog.ts`:

```ts
export const DEFAULT_BACKGROUND_TRACK: MusicTrackId = 'peaceful-village';
// Or: 'sunset-plains'
```

`MUSIC_TRACKS` is the catalog of stable IDs, display names and hosted file URLs.
Saved server worlds always use the configured default. The demo-only selector
changes the current demo session; it never changes another world's default or
persists a demo override into user settings.

## Add a soundtrack

1. Keep the original audio in the local root `sounds/` folder.
2. Add the input/output filename pair to `scripts/prepare-game-music.py`, then run
   `python scripts/prepare-game-music.py --ffmpeg <path-to-ffmpeg>`.
3. Add the output under `public/game-assets/music/` and a catalog entry in
   `music-catalog.ts`. The demo selector discovers catalog entries automatically.
4. Select its ID as the default if desired. Update the asset README's source list.

The supplied `peaceful ville.ogg` and `sunset_plains.wav` are retained locally.
Their browser copies are 44.1 kHz, 160 kbps MP3 (about 0.6 MB and 6.6 MB). The raw
`sounds/` directory is ignored by Git; only the prepared copies ship to users.
No music library or conversion dependency is bundled into the app. FFmpeg is an
offline preparation tool, not a runtime requirement.

## Runtime ownership

| Responsibility | Owner |
| --- | --- |
| Tracks and default ID | `src/features/audio/music-catalog.ts` |
| Streaming audio element and Web Audio gain | `src/features/audio/music-output.ts` |
| Playback state, stale request protection, pause and disposal | `src/features/audio/background-music.ts` |
| Game lifecycle, browser gestures and demo selection | `src/features/audio/use-game-music.ts` |
| Versioned settings validation/defaults | `src/features/settings/game-settings.ts` |
| Device storage and same-origin tab synchronization | `src/features/settings/use-game-settings.ts` |
| Shared Settings panel | `src/features/settings/GameSettingsDialog.tsx` |

One media element streams and loops the selected track. A gain node controls
volume, including browsers that restrict the media element's volume property.
The output is created on the first game interaction, with no music download while
initially muted. Playback starts from a pointer/key gesture, following browser
[autoplay restrictions](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
The media element feeds Web Audio through
[`createMediaElementSource`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource).
Autoplay rejection exposes Start music; a loading failure exposes Retry music.
Track changes cancel earlier play attempts, so stale promises cannot revive a
previous track or overwrite the current playback status.

Hidden tabs and page hiding pause playback; returning resumes the same position.
Mute sets volume to zero and pauses playback. Unmute restores the previous positive
volume in this visit (35% if the page loaded muted). Opening a game menu does not
pause the soundtrack, so volume and track changes can be heard immediately.

## Add future preferences

Settings live at `dmap:game-settings:v1` in localStorage, as
`{ version: 1, audio: { backgroundVolume: 35 } }`. Values are finite, rounded and
clamped to 0–100; malformed or unsupported saved settings fall back to defaults.
Unavailable storage still permits changes during the visit. Other same-origin tabs
receive volume changes through the storage event. These are device preferences,
not account synchronization or Discord volume controls.

Add new typed sections/defaults in `game-settings.ts`, explicitly validate them in
`parseGameSettings`, and add shared update actions in `use-game-settings.ts`.
Extend the Settings panel instead of making separate demo/real-world forms. Bump
the schema and provide a migration when changing persisted meanings.

The UI uses the existing `Dialog`, `RpgIcon`, theme variables and native range/radio
controls. Menu → Settings pauses gameplay input; closing returns focus to the
canvas. Track choices render only in demo mode. No future settings appear as
disabled placeholders.

## Verification

`pnpm exec tsx scripts/verify-game-music.ts` checks corrupt settings, saved mute,
live volume, duplicate activation, rapid track changes, stale promises,
visibility pause/resume, autoplay rejection, retries, and unmount cleanup.

Browser checks cover both real audio files and their decoded signal, loop wrap,
gain changes, retained mute after reload, uninterrupted jungle/village travel,
same-origin volume synchronization, keyboard controls and narrow layouts. A shared
Settings fixture with `demo=false` checks the production panel has volume controls
and no track selector, without requiring a Discord login.

September 13 verification: the focused script, scoped ESLint/Prettier, browser
import boundary and production build passed. The new audio/settings surface also
passed the scoped premium static audit. Chrome verified 30.16-second and
329.68-second tracks, one output across switching and portal travel, actual gain
updates, loop wrap, muted reload with no audio request, same-origin volume sync,
pagehide/pageshow pause and resume, loading-error recovery, and a 390×844 touch
layout. Leaving the game for the home page paused the outgoing audio. The existing
production bundle-size warning remains. Real Discord sign-in and physical iOS
audio output were not part of this check.
