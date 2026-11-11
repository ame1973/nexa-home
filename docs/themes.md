# Themes and advanced CSS

**English** | [繁體中文](zh-Hant/themes.md)

Choose a visual style with the palette button (**Theme styles**) in the header. The sun/moon menu controls dark, light or system mode separately. Changing a theme never changes services, their icon colors, ordering, language or access permissions.

## Availability

Use a release whose notes include theme presets/custom CSS, or build the corresponding reviewed source. The earlier `1.0.1` image predates this feature; changing a setting cannot add it to an older image. See [deployment](deployment.md) and [release operation](releases.md). No theme setting downloads code, fonts or a remote theme URL.

## Five built-in styles

Each preset has independently designed light and dark palettes, a distinct homepage layout and action feedback. On narrow screens the layouts adapt to the available space; reduced-motion preferences suppress animation. **System** follows the browser device's color-scheme preference.

| Style        | Preset ID      | Homepage character                                | Base radius | Shadow |
| ------------ | -------------- | ------------------------------------------------- | ----------- | ------ |
| Future Glass | `future-glass` | Translucent console with grouped service cards    | 16 px       | Soft   |
| Graphite     | `graphite`     | Compact gray index with horizontal service rows   | 12 px       | None   |
| Tide         | `tide`         | Teal sections with side headings on wider screens | 16 px       | Soft   |
| Forest       | `forest`       | Green grouped shelves with compact service rows   | 12 px       | None   |
| Dune         | `dune`         | Centered warm gallery with large service icons    | 20 px       | Soft   |

Density and glass remain independent settings. Disabling glass forces solid surfaces; enabling it allows the selected material, so Graphite/Dune still stay opaque. Custom token themes use solid surfaces and the grouped launcher layout for predictable contrast. **Customize a copy** copies colors, radius and shadow, not the preset's layout; advanced CSS can change the layout separately. The Future Glass accent field preserves existing installations; customize a copy to change either palette of another style. Controls, cards, dialogs, menus and notifications share the semantic tokens and derived corner scale. System fonts and Arabic RTL remain supported.

## Your browser versus site defaults

- **Theme styles → Use in this browser** stores a personal preset/custom definition and CSS. This personal style replaces the site's token/CSS combination as a unit: site CSS is not silently layered over a different personal style.
- **Use site appearance** removes only that personal style. It does not delete your saved theme library or change your independently selected mode.
- The sun/moon menu's **Use site theme** removes only the local dark/light/system override. **System** means follow the operating system, not follow the site's setting.
- **Manage → Appearance → Save changes** sets the shared default for browsers without a personal style. Only the signed-in administrator can save shared configuration; normal Origin, CSRF and revision checks apply. Conflicting drafts are retained until explicit reload.
- On first visit, a private site uses the built-in appearance until sign-in allows bootstrap settings. A previously used browser may apply its cached presentation before sign-in. That cache contains no account, session or service catalog.

Only presentation preferences are stored locally: locale, mode, cached shared appearance, personal appearance and the saved token library. Custom theme names/CSS are presentation, not a place for passwords, tokens, private service addresses or other secrets. Shared appearance enters portable backups; personal choices and the browser library do not.

## Create and keep a custom theme

1. Choose a built-in style and select **Customize a copy**. Built-ins cannot be overwritten.
2. Name it and edit background, surface and accent for both **Light** and **Dark**. Choose a base radius and no/soft shadow. Text, secondary text, control borders and focus colors are derived; incompatible surfaces without a common readable text color are rejected.
3. Compare both sample launchers. **Preview on page** temporarily applies the selected preview mode and CSS without saving. **Stop preview** or **Escape** restores the active appearance; Escape keeps the editor draft open. Editing a previewed value stops that preview.
4. **Save to this browser's library** explicitly stores a reusable token copy, up to **10** entries. Loading a library entry edits the draft; **Update saved theme** updates that specific copy. Deletion requires confirmation and does not change an already active appearance.
5. Finish with **Use in this browser**, or the administrator's **Save changes**. Saving to the library is separate and is not undone by cancelling the appearance draft. Applying a personal theme does not automatically add a library copy.

Theme JSON imports are reviewed before **Use imported theme** fills the draft; they never apply or persist automatically. Invalid UTF-8, duplicate/unknown fields, unsupported schema values and oversized files are rejected. Storage failures keep the draft instead of reporting a successful save.

## Token JSON format

The standalone UTF-8 JSON file is at most **16 KiB**, including whitespace. It contains tokens only, not CSS, service data or a remote URL. Export uses `nexa-home-theme.json`.

```json
{
  "schemaVersion": 1,
  "name": "My Tide",
  "variants": {
    "light": {
      "background": "#F0F7F8",
      "surface": "#FFFFFF",
      "accent": "#006C73"
    },
    "dark": {
      "background": "#0C1B22",
      "surface": "#132D38",
      "accent": "#6BD3CC"
    }
  },
  "radius": 16,
  "shadow": "soft"
}
```

Use `schemaVersion: 1`, a nonblank name of 1–80 Unicode characters without control characters, six-digit hex colors, `radius` of `8`, `12`, `16` or `20`, and `shadow` of `none` or `soft`. Both variants are required. Background and surface must share black or white text at **4.5:1** or better; remaining text/control/focus tokens are derived for contrast. The base radius scales the control/card/panel radii, rather than making every component the same shape.

## Advanced arbitrary CSS

Open **Advanced CSS** in either appearance editor. This is a deliberately unrestricted CSS option, not a selector/property allowlist: ordinary selectors, pseudo-classes, custom properties, `@media`, `@supports`, `@layer` and other browser-supported CSS rules are accepted. Invalid CSS stays as source and is ignored by the browser; this is not a JavaScript or HTML editor.

Raw CSS is a separate UTF-8 field/file, at most **64 KiB in bytes**, without NUL. **Import CSS file → Use imported CSS** fills only the draft; preview/save remain explicit. Export uses `nexa-home-theme.css`. CSS is not included in token JSON or library copies; shared CSS is included in the site backup.

For example, add a dashed card boundary without replacing the palette:

```css
@layer personal {
  @media (min-width: 640px) {
    .service-tile {
      border: 1px dashed var(--accent-ink) !important;
    }
  }
}
```

The `!important` is intentional for an override layer; normal unlayered application rules otherwise have priority over normal layered rules. Generated root tokens are inline properties, so overriding those same properties also requires `!important`. Class names/markup can change with releases: review custom CSS after upgrades.

**Trust the author of CSS.** It can hide controls, obscure warnings, change interaction geometry or undermine contrast/RTL/reduced-motion support. Token contrast checks do not certify arbitrary CSS. Do not apply unreviewed CSS or put secrets in it. A shared stylesheet is delivered as presentation to browsers permitted to access the site and is not a secret store.

CSS uses a dedicated `style` element with the current HTML response's nonce and is inserted as text, never interpolated HTML. Closing-style/script text cannot create a script element. CSP is not relaxed: scripts remain same-origin without inline/eval execution, and external CSS imports, fonts and images remain blocked. Existing same-origin and permitted data/blob image rules still apply. The server never fetches CSS URLs. Do not disable CSP or TLS checks to make remote imports work.

## Recover an unusable appearance

- During preview, press **Escape**. The previous appearance returns without saving, even if the preview hides the whole page.
- For an already saved style, open **`/?appearance=safe`** on the same origin. You can also use **`/admin/appearance?appearance=safe`**. Safe appearance applies Future Glass with solid surfaces and disables custom tokens/CSS before first paint. It stays active for that loaded document, even when an internal link drops the query.
- Safe appearance does not delete stored settings, reset a password, create a session or grant access to private/admin data. Existing sign-in requirements remain. Sign in normally to repair shared settings, or select a personal style to override the shared one.
- Save the repaired draft, then select **Leave safe appearance** to reload without recovery mode. Simply changing the address with client-side navigation does not turn recovery off. No data-directory or volume deletion is required.

## API, backup and upgrade compatibility

The [OpenAPI contract](../api/openapi.yaml) keeps `theme` as `dark | light | system`. The separate `themePreset`, nullable `customTheme`, and `customCSS` fields carry styling. New settings clients send all three together with the existing `expectedRevision`; legacy clients omitting all three preserve the current extensions inside the same transaction. The complete 16 MiB portable budget still includes JSON escaping and icon base64 expansion; an over-budget CSS/settings change returns `409 LIMIT_EXCEEDED` without partial writes.

Current portable exports use **backup version 3** and include shared tokens/CSS and optional health-check configuration. **Versions 1 and 2** remain importable with health checks disabled; version 1 defaults missing style extensions to Future Glass/no custom CSS. Older application versions cannot restore version 3 by merely relabelling it. Theme JSON schema 1, backup version 3 and database schema 3 are separate version numbers.

Database migration `002_themes.sql` appends columns without changing the original migration, existing preferences, revisions, credentials, sessions, audit or rate-limit state; `003_service_health.sql` adds optional monitoring. Before the current build upgrades an existing schema 1 or 2 to 3, startup saves private, fsynced **`nexa.pre-migration-v1-to-v3.db`** or **`nexa.pre-migration-v2-to-v3.db`**, including committed WAL and authentication state. An earlier theme-only build used `nexa.pre-migration-v1-to-v2.db`. The snapshot is not created for a new installation; `doctor` opens existing supported schemas read-only and never performs the upgrade. A future/invalid schema fails before journal changes.

The on-volume snapshot contains sensitive authentication state and is **not** an off-volume backup or a complete icon archive. If that snapshot name already exists while an upgrade is still pending, startup fails closed rather than overwriting it or making another copy on every restart. Stop the service, inspect the failure, preserve/move that exact file into private backup storage, and retry only after resolving the cause. Never remove or overwrite the only recovery copy. Keep the normal complete stopped backup before upgrading; rollback across schema 2 or 3 requires the pre-upgrade data and compatible older executable. See [backup and recovery](backup-and-recovery.md).
