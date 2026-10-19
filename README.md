# Document TOC (siyuan-doc-toc)

[简体中文](./README.zh-CN.md)

Generate or refresh a clickable table of contents at the top of the current SiYuan document. The TOC uses native heading block references and has no third-party runtime dependencies.

Built from [plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte): Vite 8 + TypeScript + Svelte 5.

## Features

- **One-click generation**: click the list icon in the top bar to insert a TOC at the top of the document.
- **In-place refresh**: click again to update the existing TOC without changing its block ID.
- **Clickable entries**: every entry is a native block reference that jumps to its heading.
- **Auto-update**: refresh an existing TOC after you stop typing, with a configurable delay.
- **Heading depth**: collect only h1–h3, for example, and ignore deeper headings.
- **Custom title**: change the first-line text, or leave it empty to use the localized default.
- **Preview panel**: run the “Open the TOC panel” command to inspect headings and generate the TOC.
- **Localized**: Chinese and English UI, including the default TOC title.

## Usage

1. Open a document that contains headings.
2. Click the list icon on the right side of the top bar.
3. The first click inserts a list block at the top of the document with “📑 Contents” on the first line and block references nested by heading level.
4. Click again to refresh the existing TOC in place.

You can also search for “Open the TOC panel” in the command palette to preview heading count, depth, and names.

## Settings

Open **Settings → Plugins → Document TOC**:

| Setting | Description |
| --- | --- |
| Auto-update TOC | Off by default. When enabled, refreshes an existing TOC after you stop typing. It never creates a TOC automatically. |
| Auto-update delay | 1–10 seconds; applies only when auto-update is enabled. |
| TOC title | First-line text. Leave empty for the localized default (“📑 Contents” in English, “📑 目录” in Chinese). |
| Heading depth | H1–H6. Defaults to all levels; H1–H3 ignores h4–h6. |

Settings are stored in the plugin’s private storage at `data/storage/petal/siyuan-doc-toc/settings.json`, not in your notes.

## Behavior

- The TOC block carries `custom-toc-generator="true"`, `custom-toc-source="<document ID>"`, and a content signature `custom-toc-signature`.
- The signature lets auto-update detect stale content after a restart or document switch, avoiding redundant writes.
- Existing TOCs are updated in place, preserving the block ID. A new block is created only when the old TOC is missing or has been converted to another block type.
- After insertion, the plugin only marks a block when it is the first child, is a list, and contains the TOC title. If verification fails, it reports an error instead of tagging an unrelated block.
- Only headings h1–h6 are collected, with at most 5 indentation levels.
- If a document has no headings, the plugin only shows a message and writes nothing.
- Auto-update skips when the cursor is inside the TOC, the window is unfocused, no TOC exists, or the heading structure has not changed.
- The TOC is an ordinary list block. You may edit or delete it manually, then click the button to regenerate it.

## Data impact

- Reads only the current document ID, heading outline, document title, and document change notifications (when auto-update is on).
- Writes only to the current document: updates the existing TOC (removing duplicate old blocks when necessary) or inserts a new TOC at the top.
- Creates no documents, modifies no other documents, and does not touch workspace configuration.
- No network requests and no third-party runtime dependencies.

## Compatibility

- Frontends: `desktop`, `desktop-window`, `browser-desktop`.
- Minimum SiYuan version: 3.7.0.

## Development

```bash
pnpm install
pnpm dev      # watch build into dist/
pnpm check    # TypeScript + Svelte checks
pnpm build    # production build into dist/
```

To release a new version, bump `version` in both `package.json` and `plugin.json`, then push a `v<version>` tag. GitHub Actions builds the plugin and attaches `package.zip` to the Release.

## Known limitations

- With multiple windows or split views, the most recently focused editor is used.
- If the document is modified externally during generation, run the command again.
- Auto-updates enter the undo history, so consecutive undos may undo a TOC refresh first.
- If you manually remove the custom attributes from the TOC block, the plugin treats it as an ordinary list and creates a new TOC; the old list is not adopted automatically.

## License

MIT
