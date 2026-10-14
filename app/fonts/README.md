# Self-hosted Inter

Inter remains the application font. `next/font/local` bundles this unmodified
upstream variable font so production builds do not depend on Google Fonts DNS,
TLS or download availability. No system-font fallback is substituted as a fake
successful build.

Source: Google Fonts, `ofl/inter/Inter[opsz,wght].ttf`, pinned commit
`0b58fb370093f9a9f4ff785d94405710b79de67c`.

- Font URL: https://raw.githubusercontent.com/google/fonts/0b58fb370093f9a9f4ff785d94405710b79de67c/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf
- Font SHA256: `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`
- Original Git blob SHA: `047c92f6e2212473dc436020afed689527076d44`
- Size: 876576 bytes (complete normal variable font, not a subset)
- License: SIL Open Font License 1.1; copyright Inter Project Authors.
- Unmodified upstream license is included as `OFL.txt`.
- License SHA256: `5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57`

The official GitHub Contents API was used to retrieve the pinned bytes after
the raw endpoint reset its connection. Both Git blob hashes were verified.
The full font is larger than Google's Latin subset; validate the first-load
transfer budget on Linux before approving deployment. Do not replace it from
an unpinned URL, modify the font binary, or remove its license.
