# Changelog

## 1.0.1

- Fixed the TOC only listing top-level headings. The outline API nests child headings under `blocks` (not `children`); the generator now accepts both shapes.
- Child heading titles are read from `content` when `name` is empty, so nested entries no longer show as “Untitled”.
- Verified with h1 → h2 → h3 → h2 ordering and with the `maxLevel` setting.

## 1.0.0

- Rebuilt the plugin with the official `plugin-sample-vite-svelte` template (Vite 8, TypeScript, Svelte 5).
- Added a Svelte TOC preview panel with the `openDialog` command.
- Localized the TOC title; the default now follows the SiYuan UI language.
- Added configurable heading depth (H1–H6) and improved the auto-update delay setting.
- Store a content signature on the TOC block so auto-update no longer rewrites unchanged TOCs after a restart.
- Verify inserted blocks before marking them; never tag an unrelated first child.
- Clean up duplicate TOC blocks and preserve the original block ID when updating.
- Migrated existing `debounceMs` settings to the new seconds-based setting.
- Guard auto-update against focus changes and cursor position inside the TOC.
