# Animated character samples

These two original, self-contained GLB files are by [Quaternius](https://quaternius.com/). Their individual Poly Pizza pages identify the license as **Public Domain (CC0 1.0)**, checked on September 7, 2026. The files are self-hosted here without changes to the downloaded bytes.

| File                   | Source page                                         |            Size | Animation clips |
| ---------------------- | --------------------------------------------------- | --------------: | --------------: |
| `animated-woman.glb`   | [Animated Woman](https://poly.pizza/m/qJ2gsTUBHL)   | 1,530,616 bytes |              24 |
| `hoodie-character.glb` | [Hoodie Character](https://poly.pizza/m/gKLBoRsyKe) | 1,456,760 bytes |              24 |

License: [CC0 1.0 Universal dedication](https://creativecommons.org/publicdomain/zero/1.0/), [legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode). Attribution is recorded for provenance; CC0 does not require attribution. The broader user-supplied Poly Pizza bundle was not imported.

`manifest.json` records the direct download URLs, SHA-256 checksums, mesh and material counts, and every animation name, duration, and track count parsed with Three.js GLTFLoader. Both assets contain four meshes, seven materials, no images, and no external resource dependencies. FBX2glTF v0.9.7 generated the supplied glTF 2.0 files.

The experiment selects these samples by alternating avatar slots. It uses `CharacterArmature|Idle_Neutral`, `CharacterArmature|Walk`, and `CharacterArmature|Run`; the other bundled clips remain unused. Each character has an independent cloned skeleton and animation mixer. Both models face +Z natively, matching the world engine; the runtime normalizes neutral idle height to 48 world units with feet at Y = 0. Reduced motion holds the first neutral idle pose.
