# The Hollow Choir

Generated from [the game’s story source](../src/content/stories/hollow-choir.json).
Edit that JSON file, then run `pnpm story:docs`; normal builds also regenerate this document.
The game reads the JSON directly. Do not hand-edit this generated script.

## Premise

A choir seeking protection has trapped the forest keeper in a sleeping, humanlike form. Break its seals, defeat the creature feeding on the ritual, and let the keeper return to the forest.

## Lore

Rootbound Temple once sheltered the forest keeper. Its moon and sun seals were safeguards that could be opened by human hands, never a claim of ownership over the forest.

As the roots swallowed the paths to their home, Cantor Vey and six choir members tried to renew that promise. They read an old binding rite as a blessing. Their unbroken chant now holds the keeper in a borrowed, sleeping form on the red-draped altar.

The Bound Warden is a root creature feeding on the trapped keeper. The seals conceal and sustain it. Releasing both seals exposes the creature; defeating it makes the altar safe to unbind.

Mira entered the ruins with the choir and left her field notes in the west reliquary. She and the scout Oren now wait at the southern camp. Mira asks the traveler to end the binding and bring back the notes.

The traveler frees the keeper rather than claiming its power. The sleeping form dissolves into the spirit seen in the release animation. The red cloth is left empty, the choir falls silent, and Vey promises to repair the paths without binding the forest again.

## Cast

**The traveler** — The player’s chosen LPC character. An outsider who can operate the old mechanisms and interrupt the binding.

**Mira** — A field scholar at the southern camp. Her missing notes reveal that the rite was intended as a promise of shelter.

**Oren** — An expedition scout who explains the gates, dangerous blades, pressure plates and safe retreat.

**Cantor Vey** — Leader of the choir. He meant to protect his home and now needs help undoing the ritual.

**The six choir members** — Fixed ritual participants. They pray while the keeper is bound and lower their hands when it is released. They are not combat targets.

**The forest keeper** — The sleeping figure on the red-draped altar is its bound, borrowed form. The ghost is its released spirit. These are two states of one character.

**The Bound Warden** — A predatory root creature drawn to the ritual. It is distinct from the keeper and appears only after both seals are broken.

## Playable story

1. **Voices in the ruins.** Meet Mira and Oren at the southern camp, then follow the path to the northern sanctuary entrance.

2. **The binding.** Read the inscription, see the sleeping keeper and speak to Vey. The altar explains why it cannot yet be released.

3. **Two lights to silence.** Raise the gates using the two levers. Avoid the sun chamber blade and moon chamber pressure plates. Release both seals in either order; the sun seal also stops its blade. The east chest offers supplies.

4. **The last note.** Defeat the exposed Bound Warden, then use the altar. The keeper leaves its sleeping form, the choir stops praying, and the hall blade stops.

5. **A promise restored.** Open the west reliquary, recover the field notes and return them to Mira outside.

## Complete dialogue script

Each numbered line is one dialogue page. “Locked” is the response before a prerequisite is met;
“Repeat” is the response after a one-time action has already been completed.
The default closing button reads **Back to exploring**.

### Voices in the ruins

#### Mira — `mira`

**Main dialogue: Mira**

_Field scholar_

1. Hear that? Six voices, one note. They have been singing since the roots swallowed the old path.

2. I went inside with the choir. Their leader meant to save the forest, but the rite bound its keeper. That sleeping figure on the red-draped altar is the keeper’s borrowed form. Now something else is feeding on it.

3. My notes are in the west reliquary. Follow the northern path into the sanctuary. The two side-room levers open the way to the seals. Quiet both flames, face what emerges, then release the keeper at the altar.

#### Oren — `oren`

**Main dialogue: Oren**

_Expedition scout_

1. The levers raise the gates. The sun chamber blade keeps turning until its seal is released; go around its reach. The west wing has pressure spikes: keep to the clear stones.

2. There are healing supplies inside. Your way back is always the south doorway. If you fall, you will catch your breath at the entrance; the seals you broke stay broken.

### The binding

#### threshold inscription — `entry-inscription`

**Main dialogue: The Hollow Choir**

_An inscription beneath the dust_

1. “Two lights to bind. Two hands to release. No keeper shall be made a prisoner.”

2. The choir has mistaken a binding rite for a blessing. Use the levers beside the west and east gates, then silence the seals beyond them. You can return through the south doorway at any time.

#### Cantor Vey — `cantor`

**Main dialogue: Cantor Vey**

_Keeper of the choir_

1. The roots are closing over our home. We called the keeper to protect us. Why does the forest answer with teeth?

2. Those flames are ancient. If you know how to quiet them, do it. I cannot stop the chorus alone.

### Two lights to silence

#### west lever — `west-lever`

**Main dialogue: Moon mechanism**

_An old counterweight_

1. The lever gives with a heavy click. The west gate rises.

2. The moon seal is in the chamber beyond. Its flame is feeding the ritual. Use it to break the binding.

**Repeat: Moon mechanism**

_The way is open_

1. The west gate is already raised.

#### moon seal — `west-seal`

**Main dialogue: The moon seal**

_A binding unmade_

1. You turn the engraved stone. The flame gutters; one voice leaves the chorus.

2. When both seals are quiet, the creature feeding on them will have nowhere left to hide. Be ready in the central hall.

**Repeat: The moon seal**

_Quiet stone_

1. This binding is already broken.

#### east lever — `east-lever`

**Main dialogue: Sun mechanism**

_An old counterweight_

1. The lever gives with a heavy click. The east gate rises.

2. The sun seal is in the chamber beyond. Its flame is feeding the ritual. Use it to break the binding.

**Repeat: Sun mechanism**

_The way is open_

1. The east gate is already raised.

#### sun seal — `east-seal`

**Main dialogue: The sun seal**

_A binding unmade_

1. You turn the engraved stone. The flame gutters; one voice leaves the chorus. The blades in the sun chamber stop.

2. When both seals are quiet, the creature feeding on them will have nowhere left to hide. Be ready in the central hall.

**Repeat: The sun seal**

_Quiet stone_

1. This binding is already broken.

#### explorer’s supply chest — `supplies`

**Main dialogue: An explorer’s supplies**

_Two healing herbs recovered_

1. Two sealed bundles are still dry. You take the healing herbs. Press H when you need them.

**Repeat: The supply chest**

_Already searched_

1. You have already taken its two healing herbs.

### The last note

#### keeper’s altar — `keeper-release`

**Locked: The bound keeper**

_A voice under the chorus_

1. A small figure lies still on the red cloth. Its eyes stay closed, but a voice reaches you through the chant.

2. “The two lights hold me. The thing below drinks what remains. Break the seals, then defeat it. Only then can you open my binding.”

**Main dialogue: The forest keeper**

_The last note_

1. “You did not call me here. You listened.”

2. The binding loosens beneath your hand. The sleeping shape dissolves into pale light. The keeper rises from the red cloth and returns to the forest, and the chorus finally falls silent.

3. Cantor Vey lowers his hands. “The west reliquary is open to you. Mira’s notes are there. Tell her we mistook possession for protection.”

**Repeat: The quiet altar**

_The binding is gone_

1. The red cloth lies empty. A little warmth remains in the stone. The keeper has returned to the forest.

#### Cantor Vey — `cantor-restored`

**Main dialogue: Cantor Vey**

_A humbled keeper_

1. We will mend the paths and leave the forest its own voice. No more bindings. You have my word.

### A promise restored

#### west reliquary — `reliquary`

**Locked: The west reliquary**

_Held by the binding_

1. Its clasp hums with the same note as the altar. Free the keeper to open it.

**Main dialogue: The recovered field notes**

_Field notes and two healing herbs_

1. Mira’s missing pages describe the rite as a promise of shelter, never a summons. You tuck them safely away.

2. You also find two healing herbs. Return through the south doorway and give Mira her notes.

**Repeat: The west reliquary**

_Already searched_

1. The field notes are safe with you. Mira is waiting outside.

#### Mira — `mira-return`

**Main dialogue: Mira**

_The forest can breathe again_

1. You brought the pages back—and listen. No chorus. Just the wind.

2. These words were a promise to shelter the keeper, not bind it. I will help Vey remember that. Thank you for seeing this through.

**Repeat: Mira**

_A story completed_

1. The notes are safe. Next time we enter those ruins, it will be to learn, not to take.

## In-game objectives

- `interior-complete`: The keeper is free. Mira has her notes.
- `return-notes`: Return the recovered field notes to Mira outside.
- `open-reliquary`: Open the reliquary in the west chamber.
- `free-keeper`: Use the altar to release the forest keeper.
- `defeat-warden`: Defeat the Bound Warden in the central hall.
- `release-sun`: Release the sun seal in the east chamber. 1 / 2 seals.
- `release-moon`: Release the moon seal in the west chamber. 1 / 2 seals.
- `release-both`: Use the side-room levers, then release both seals. 0 / 2.
- `courtyard-complete`: The keeper is free. The forest can heal.
- `give-notes`: Give Mira her field notes at the southern camp.
- `enter-sanctuary`: Meet the explorers, then enter the sanctuary to the north.

## Location text

**The Hollow Choir** — Rootbound sanctuary · Two lights to bind. Two hands to release.

**Rootbound Temple** — The Hollow Choir · Meet the explorers and enter the northern sanctuary

## Current scope and future decisions

- Current demo reward: the supply chest and reliquary each grant two healing herbs once. The field notes are a recorded story fact, not an equipment item.

- A permanent rare item, loot table and equipment effects are reserved for a later design discussion.

- Travel and defeat preserve story progress during the expedition. Reloading starts a fresh local story; production persistence and multiplayer authority are future work.

- The altar sleeper and draped stone are native Objects_interior.png artwork. The pack provides a static altar figure, not an independent sleeping/waking character rig; the released spirit uses the separate Ghost.png animation.

- This is Dmap’s original demo story using licensed art. The asset publisher’s showcase layout does not establish these names or this lore.
