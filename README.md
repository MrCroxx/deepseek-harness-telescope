# Telescope Search for DeepSeek Harness

A telescope.nvim-style floating fuzzy finder for the DeepSeek Harness Web UI
and Desktop app. Open one modal, type, and search session titles, workspaces,
paths, and message bodies; preview the match before opening the session.

[简体中文](README.zh.md)

> Community plugin. Not an official DeepSeek Harness component.

## Features

- **One floating finder** in `shell.overlay`, plus a **Search** row in the
  sidebar foot (a magnifier icon when the sidebar is collapsed).
- **Fuzzy session search** across titles, workspace names, and paths, with
  title matches weighted above workspace and path matches.
- **Full-text body search** through the Host's session index, debounced and
  cancellable.
- **Content-aware preview**: body excerpts are rendered for reading, not as
  raw JSON. Tool calls become labelled argument cards, commands become wrapped
  code blocks, and truncated excerpts are marked.
- **Match-reason-aware preview**: a title/path match leads with the highlighted
  title; an incidental body match stays secondary instead of taking over the
  pane.
- **Keyboard first**: arrows, `PageUp`/`PageDown`, `Enter`, `Ctrl+U`, `Esc`.
  `Tab` is kept inside the finder so focus can never fall behind the dialog.
- **Desktop `⌘K` takeover**: on first load the Desktop app's built-in
  `session.search` chord is moved to **Telescope search** through the shortcut
  service's own preference edit. It is visible and reversible in
  **Settings → Keyboard shortcuts**.
- **English and Chinese UI**, following the app locale.

## Requirements

- A DeepSeek Harness build with the client plugin slots
  `shell.overlay` / `sidebar.footer.action`, the shared shortcut service, and
  the `sessions` / `uiWorkspace` services used by the finder.
- The profile must include the Host's `session-query-sqlite` row for body
  search. This bundle's `cordis.patch.yml` enables that index with
  `openAt: first-search`; the standard Web app bundle ships the row.
- Node.js is only needed to install the profile dependencies; the plugin itself
  is plain ES modules and has no build step.

Tested against DeepSeek Harness `0.2.2-rc.1`. Newer client APIs may need small
adjustments.

## Installation

This repository is a **local profile bundle**, not an npm package. Clone it and
link it into a DSH profile.

```bash
git clone https://github.com/MrCroxx/deepseek-harness-telescope.git
```

Then, in the profile directory (`~/.dsh/profiles/desktop` for the Desktop app,
or `~/.dsh/profiles/web` for the Web profile):

1. Add the package as a linked dependency:

   ```bash
   pnpm add link:/path/to/deepseek-harness-telescope
   ```

   The profile's `package.json` should now contain:

   ```json
   "dependencies": {
     "@local/telescope-search": "link:/path/to/deepseek-harness-telescope"
   }
   ```

2. Add the bundle to the profile's ordered bundle list:

   ```json
   "dsh": {
     "profile": {
       "bundles": [
         "@deepseek-ai/dsh-base",
         "@deepseek-ai/dsh-web-app",
         "@local/telescope-search"
       ]
     }
   }
   ```

3. If you edited `package.json` by hand rather than using `pnpm add`, run
   `pnpm install` in the profile directory.

4. Restart DSH. On the Desktop app, quit and reopen; for a Web profile, restart
   the `dsh web` server.

The package name is intentionally scoped `@local/` and marked private: it is a
profile bundle, not an npm package.

## Usage

Open the finder with the **Search** row at the bottom of the sidebar, or with a
shortcut:

| Context | Default |
| --- | --- |
| Desktop | `⌘K` after the one-time takeover; the command's own default is `⌘⇧F` / `Ctrl+Shift+F` |
| Web (macOS / Windows) | `⌘⌥F` / `Ctrl+Alt+F` |
| Web (Linux) | Unbound by default; assign it in **Settings → Keyboard shortcuts** |

Inside the finder:

| Key | Action |
| --- | --- |
| `↑` / `↓`, `Ctrl+N` / `Ctrl+P` | move the highlight |
| `PageUp` / `PageDown` | jump eight rows |
| `Enter` | open the highlighted session |
| `Tab` / `Shift+Tab` | stay in the prompt (never move focus behind the dialog) |
| `Ctrl+U` | clear the prompt |
| `Esc` | close |

`Tab` is deliberately captured. telescope.nvim binds `<Tab>` to multi-selection
(`toggle_selection` + `move_selection_worse`, with `<S-Tab>` moving the other
way), but this finder has no multi-selection. Letting the browser use `Tab` for
focus traversal would move focus behind the scrim and silently break typing and
the arrow keys, so `Tab` / `Shift+Tab` return focus to the prompt instead.
`Esc` remains the documented keyboard exit.

### Reading results

A row can match locally (title/workspace/path), in the body, or both. The
preview follows the match reason:

- **Title/path match**: the title is highlighted and shown first. If the body
  also matched, it is labelled **Also matched in body**.
- **Prose body match**: the excerpt is shown as readable text.
- **Structured/tool body match under a title/path match**: only a one-line
  note is shown (`tool call · edit · path` or `structured argument`). A JSON
  argument dump never takes over the pane; press `Enter` to open the session.
- **Body-only match**: the excerpt is the primary content. Rows carry a
  `body` or `tool` badge.

The preview is intentionally a source-labelled card rather than a chat bubble:
`session.search` returns one anonymous 240-code-point snippet with no message
role, so a bubble would imply a sender and a whole message the client does not
have.

## Matching and ranking

| Source | Indexed? | Notes |
| --- | --- | --- |
| Session title | Client fuzzy | Weight `1.25`; local matches outrank body-only matches |
| Workspace name | Client fuzzy | Weight `0.8` |
| Path basename / cwd | Client fuzzy | Weights `0.75` / `0.55` |
| User message text | Host FTS (`user/message`) | Body hit; one excerpt per session |
| Assistant message text | Host FTS (`assistant/message`) | Body hit; same index as user text |
| Thinking / reasoning blocks | **No** | The Host's text extractor returns `[]` for `reasoning` blocks |
| Tool calls and results | Host FTS (`tool/call`, `tool/result`) | Body hits; rendered as tool cards |
| Todos and turn errors | Host FTS | Body hits |

The local title/workspace/path pass is weighted in the client. Body search uses
the Host's own ranking (`match_count`, then shorter documents, then recency).
The `session.search` RPC returns only `{ sessionId, snippet }`, with no event
type, so user text, assistant text, and tool output cannot be re-weighted
separately in the client. Thinking is already absent from the Host index, so it
needs no weight. A true source-weighted body search would require a Host-side
search API change.

The RPC also caps every excerpt at **240 code points**, regardless of the
index's `snippetChars` setting. The preview therefore formats that bounded
window and offers `Enter` to open the session for the full context. The index
is in-memory (`path: ':memory:'`) and opens on the first search; it does not
slow Host startup.

## Desktop `⌘K` takeover

The sidebar search bar and its shortcut belong to the shipped
`@deepseek-ai/dsh-client-ui-workspace` plugin. Its `session.search` command is
registered in the shared shortcut service, and that service has no
replace-an-existing-command API.

On the Desktop app this plugin performs a one-time, reversible takeover on
first load: it copies the current `session.search` chord to **Telescope
search** through the shortcut service's own preference edit and clears the old
binding. The old inline search bar stays clickable, but its chord now opens
Telescope. The change is stored as a normal shortcut override:

- inspect or change it in **Settings → Keyboard shortcuts**;
- **Restore Defaults** puts `⌘K` back on *Search sessions* and returns
  Telescope to its default chord;
- the marker `dsh.telescope.takeover.v1` in `localStorage` prevents the plugin
  from silently taking the chord over again after a restore.

Web profiles keep the built-in search chord; the takeover is Desktop-only.

## Limitations

- The Host returns one 240-code-point snippet per session and no event/source
  metadata. Per-source body weights (user vs. assistant vs. tool) are not
  available to the client.
- Tool calls and tool results are part of the Host index. A tool-only match is
  shown as a structured card, and a tool match secondary to a title match is
  reduced to a one-line note.
- No multi-selection. `Tab` is intentionally inert inside the prompt.
- The Desktop takeover is a preference override, not a plugin replacement. The
  built-in search bar itself remains part of `ui-workspace`.

## Development

The plugin has no build step. Files:

- `index.js` — side-effect-free Host half; exists so the Client module scanner
  discovers the package's `dsh.client` section.
- `client.js` — browser half: overlay, sidebar trigger, shortcut command,
  fuzzy matcher, Host search integration, preview renderer, and styles.
- `cordis.patch.yml` — bundle patch: enables the session-query index for body
  search and inserts the bundle row.
- `locale/en.json`, `locale/zh.json` — plugin metadata shown by DSH.
- `icon.svg` — original artwork.

Quick checks:

```bash
node --check client.js
node --check index.js
```

During development, link the repository into a profile as described above.
The Host's client bundle poll reloads `client.js` on change; a profile restart
is the fallback.

## License

[MIT](LICENSE)
