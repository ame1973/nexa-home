# Retained upstream license sources

Nexa Home's own license is the root `LICENSE`. `THIRD_PARTY_NOTICES.md` retains third-party copyright notices and license texts for redistribution. `npm run notices -- --check` verifies that the inventory still matches the installed locked dependencies and imported Go modules.

Two upstream texts are retained separately:

- `shadcn-ui.txt`: the MIT license for copied shadcn/ui primitives, from [shadcn-ui/ui at 8a3536678a528cc012b9e62484290e79d0be410f](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/LICENSE.md).
- `react-remove-scroll-bar-2.3.8.txt`: that npm release declares MIT but omits a license file from its published package. The upstream project's MIT text and attribution are retained verbatim from [theKashey/react-remove-scroll-bar at 8ca9ba5ea52de03308fe8ced94f7b159a44d28ff](https://github.com/theKashey/react-remove-scroll-bar/blob/8ca9ba5ea52de03308fe8ced94f7b159a44d28ff/LICENSE), license blob `7c08c3990396ecefd90f99ff5d9a34f26f5b5616`. The fallback is version-specific and must be reviewed if the dependency changes.

The generator reads other texts directly from regular license/notice files in the installed npm packages, imported Go module directories, and Go toolchain. It does not fetch licenses over the network or infer copyright holders. Test, scanning, build-container and optional emulation tools are not redistributed with the runtime image.
