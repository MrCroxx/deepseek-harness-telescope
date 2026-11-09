/**
 * Telescope Search — browser half.
 *
 * A telescope.nvim-style floating finder for the Harness Web UI: one modal
 * prompt, fuzzy matches across session titles / workspaces / paths plus live
 * Host content search, keyboard navigation, and a preview pane.
 *
 * The plugin is additive and platform-clean: the overlay is an entry in
 * `shell.overlay`, the trigger is a row in the sidebar foot, and the hotkey is
 * a real command in the shared shortcut service (so it appears in Settings →
 * Keyboard shortcuts, supports rebinding, and reaches the Desktop native
 * keyboard bridge). Data comes from the framework's standard feeds
 * (`useSessions` / `useWorkspaces` / `useSessionStatus`) and the public
 * `uiWorkspace` / `sessions` services, never from another plugin's DOM.
 */

window.__ModuleLoader__.load({
  id: '@local/telescope-search',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'telescope'

    /** Fuzzy list cap; the Host already bounds the content-search page. */
    const MAX_ROWS = 80
    /** Recent rows shown before the operator types. */
    const MAX_RECENT = 60
    /** Pause between the latest keystroke and a Host content-search request. */
    const SEARCH_DEBOUNCE_MS = 200
    /** Stable fallbacks for the shortcut catalog subscription (service absent). */
    const EMPTY_CATALOG_ROWS = []
    const NOOP_SUBSCRIBE = () => () => {}
    const EMPTY_CATALOG = () => EMPTY_CATALOG_ROWS

    /** Command id registered with the shared shortcut service. */
    const COMMAND_ID = 'telescope.open'

    const IS_APPLE = (() => {
      try {
        const data = navigator.userAgentData
        const platform = (data && data.platform) || navigator.platform || ''
        return /mac|iphone|ipad|ipod/i.test(platform)
      } catch {
        return /mac/i.test(String(navigator.userAgent || ''))
      }
    })()
    const CLEAR_LABEL = IS_APPLE ? '⌃U' : 'Ctrl U'

    /**
     * Editable defaults. Desktop uses Mod+Shift+F. Web uses Mod+Alt+F because
     * Mod+Shift+F is already the Web default of `session.fork`; Linux Web
     * omits the profile (its browser policy reserves most letter chords), so
     * the command shows unbound there and can be assigned in Settings.
     */
    const COMMAND_DEFAULTS = {
      'desktop:macos': { code: 'KeyF', modifiers: ['primary', 'shift'] },
      'desktop:windows': { code: 'KeyF', modifiers: ['primary', 'shift'] },
      'desktop:linux': { code: 'KeyF', modifiers: ['primary', 'shift'] },
      'web:macos': { code: 'KeyF', modifiers: ['primary', 'alt'] },
      'web:windows': { code: 'KeyF', modifiers: ['primary', 'alt'] },
    }

    const CSS = `
.tsl-scrim {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(28px, 8vh, 88px) 24px 24px;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-mask-1, color-mix(in srgb, var(--dsw-alias-bg-base) 64%, transparent));
  backdrop-filter: var(--dsw-mask-blur, blur(6px));
  animation: tsl-scrim-in 140ms ease-out;
}
.tsl-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(980px, 100%);
  height: min(640px, 100%);
  min-height: 340px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-overlay);
  background-image: radial-gradient(120% 90% at 50% -30%, color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent), transparent 62%);
  box-shadow: var(--dsw-shadow-lv3, 0 28px 70px -24px rgba(0, 0, 0, 0.62));
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  animation: tsl-panel-in 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.tsl-strip {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px 9px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 16px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}
.tsl-strip-title { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.tsl-strip-sep { opacity: 0.55; }
.tsl-strip-hint { letter-spacing: 0.06em; opacity: 0.85; }
.tsl-spacer { flex: 1; }
.tsl-close {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.tsl-close:hover {
  background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent));
  color: var(--dsw-alias-label-primary);
}
.tsl-prompt {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.tsl-caret {
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 18px;
  line-height: 1;
  font-weight: 700;
  color: var(--dsw-alias-brand-primary);
}
.tsl-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 15px;
  line-height: 24px;
  caret-color: var(--dsw-alias-brand-primary);
}
.tsl-input::placeholder { color: var(--dsw-alias-label-secondary); opacity: 0.85; }
.tsl-count {
  flex: none;
  padding: 2px 7px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 15px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tsl-count.is-busy { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent); }
.tsl-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr);
}
.tsl-list {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tsl-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 10px 8px 12px;
  border-left: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}
.tsl-row:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.tsl-row.is-active {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent);
  border-left-color: var(--dsw-alias-brand-primary);
}
.tsl-row-top {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.tsl-row-title {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13.5px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.tsl-row.is-active .tsl-row-title { font-weight: 600; }
.tsl-hit { color: var(--dsw-alias-brand-primary); font-weight: 700; }
.tsl-row-meta {
  flex: none;
  margin-left: auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tsl-row-sub {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 16px;
}
.tsl-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary);
}
.tsl-dot.is-running {
  background: var(--dsw-alias-state-success-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent);
}
.tsl-dot.is-pending { background: var(--dsw-alias-state-warn-primary); }
.tsl-dot.is-done { background: var(--dsw-alias-state-success-primary); }
.tsl-dot.is-blank { background: var(--dsw-alias-state-idle-primary); }
.tsl-badge {
  flex: none;
  padding: 1px 5px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9px;
  line-height: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}
.tsl-badge.is-content { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); }
.tsl-badge.is-current { color: var(--dsw-alias-state-success-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent); }
.tsl-preview {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 16px;
  border-left: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 40%, transparent);
}
.tsl-eyebrow {
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 14px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.tsl-pv-title {
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  word-break: break-word;
}
.tsl-pv-badges { display: flex; flex-wrap: wrap; gap: 5px; }
.tsl-pv-sub {
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
  line-height: 17px;
  word-break: break-all;
}
.tsl-kv {
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr);
  gap: 5px 10px;
  font-size: 11px;
  line-height: 16px;
}
.tsl-kv dt { color: var(--dsw-alias-label-secondary); }
.tsl-kv dd { margin: 0; color: var(--dsw-alias-label-primary); word-break: break-all; }
.tsl-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
/* The matched host excerpt is the preview's primary content: a readable,
   scrollable quote with query terms emphasized, not a footnote under metadata.
   Prose and tool-call arguments use different typography: message text reads as
   text, while structured arguments expand into labelled fields and code blocks
   instead of a raw JSON one-liner. */
.tsl-excerpt {
  padding: 12px 14px 13px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-left: 2px solid var(--dsw-alias-brand-primary);
  border-radius: 0 8px 8px 0;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  font-size: 12.5px;
  line-height: 20px;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.tsl-excerpt-inner {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.tsl-body-match {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tsl-excerpt-label {
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 14px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.tsl-body-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 60%, transparent);
}
.tsl-body-note-line {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}
.tsl-body-note-source {
  flex: none;
  color: var(--dsw-alias-brand-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.tsl-body-note-text {
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 16px;
  overflow-wrap: anywhere;
}
.tsl-prose {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12.5px;
  line-height: 20px;
}
.tsl-excerpt-hit {
  padding: 0 1px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, transparent);
  color: var(--dsw-alias-brand-primary);
  font-weight: 700;
}
.tsl-tool {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent);
  overflow: hidden;
}
.tsl-tool-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}
.tsl-tool-name {
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  font-size: 11px;
}
.tsl-tool-trunc {
  margin-left: auto;
  color: var(--dsw-alias-label-secondary);
  letter-spacing: 0.02em;
  text-transform: none;
}
.tsl-tool-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px 10px 10px;
}
.tsl-excerpt dl,
.tsl-excerpt dt,
.tsl-excerpt dd,
.tsl-excerpt ul,
.tsl-excerpt ol {
  margin: 0;
}
.tsl-json-fields {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.tsl-json-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tsl-json-key {
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 14px;
  letter-spacing: 0.03em;
  overflow-wrap: anywhere;
}
.tsl-json-value {
  margin: 0;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.tsl-json-string { white-space: pre-wrap; }
.tsl-json-atom {
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}
.tsl-json-list {
  margin: 0;
  padding-left: 15px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.tsl-json-item > .tsl-json-fields {
  padding-left: 9px;
  border-left: 1px solid var(--dsw-alias-border-l1);
}
.tsl-json-item::marker {
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
}
.tsl-json-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tsl-json-chip {
  padding: 1px 5px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent);
  font-size: 11px;
  line-height: 16px;
}
.tsl-code {
  margin: 0;
  padding: 7px 8px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 70%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-3) 60%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 16.5px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.tsl-pv-note {
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
  line-height: 18px;
}
.tsl-pv-open-hint {
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  line-height: 15px;
  opacity: 0.9;
}
.tsl-pv-empty {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.tsl-glyph { color: var(--dsw-alias-brand-primary); opacity: 0.85; }
.tsl-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 16px;
}
.tsl-hint { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.tsl-kbd {
  display: inline-block;
  min-width: 14px;
  padding: 1px 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 13px;
  text-align: center;
}
.tsl-status { margin-left: auto; white-space: nowrap; }
.tsl-status.is-busy { color: var(--dsw-alias-brand-primary); }
.tsl-status.is-error { color: var(--dsw-alias-state-error-primary); }
.tsl-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 24px 18px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 19px;
}
.tsl-empty-title { color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 500; }
.tsl-trigger {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% + 4px);
  height: 42px;
  margin: 4px -2px;
  padding: 0 10px 0 8px;
  box-sizing: border-box;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
  overflow: hidden;
}
.tsl-trigger:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)); }
.tsl-trigger.is-rail {
  width: 36px;
  height: 36px;
  margin: 8px 0 10px;
  padding: 0;
  justify-content: center;
  border-radius: 50%;
}
.tsl-trigger-label { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: left; }
.tsl-trigger-kbd {
  flex: none;
  padding: 1px 5px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 14px;
}
@keyframes tsl-scrim-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes tsl-panel-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.99); }
  to { opacity: 1; transform: none; }
}
@media (max-width: 760px) {
  .tsl-scrim { padding: 16px; }
  .tsl-body { grid-template-columns: minmax(0, 1fr); }
  .tsl-preview { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .tsl-scrim, .tsl-panel { animation: none; }
}
`

    // ---------------------------------------------------------------------
    // Copy
    // ---------------------------------------------------------------------

    const en = {
      'open.label': 'Search sessions',
      'trigger.label': 'Search',
      'command.label': 'Telescope search',
      'command.blocked': 'Close the open dialog first',
      'mode.title': 'Telescope',
      'mode.scope': 'Sessions',
      'prompt.placeholder': 'Fuzzy search sessions…',
      'results.count': '{n} results',
      'results.countOne': '1 result',
      'results.recent': 'recent sessions',
      'results.mode': 'title / path / body · fuzzy',
      'results.searching': 'searching message body…',
      'results.unavailable': 'body search unavailable',
      'empty.noSessions': 'No sessions yet',
      'empty.noMatches': 'No matches for “{q}”',
      'empty.hint': 'Try a title, workspace, path, or any word from the message body.',
      'empty.idle': 'Open a session to start writing history.',
      'preview.title': 'Preview',
      'preview.workspace': 'Workspace',
      'preview.path': 'Path',
      'preview.body': 'Body match',
      'preview.meta': 'Title / path match',
      'preview.metaAndBody': 'Title / path match · body too',
      'preview.alsoBody': 'Also matched in body',
      'preview.alsoTool': 'tool call',
      'preview.session': 'Session',
      'preview.noContent': 'This hit is on the title or path; the host returned no body excerpt for it.',
      'preview.tool': 'tool call',
      'preview.structured': 'structured argument',
      'preview.truncated': 'excerpt ends',
      'preview.openHint': 'The Host excerpt is bounded; press Enter to open the session for the full context.',
      'preview.searchFailed': 'Body search failed',
      'preview.searchingBody': 'Searching the message body…',
      'preview.empty': 'Select a result to preview',
      'preview.emptyHint': '↑ ↓ to move · Enter to open',
      'badge.content': 'body',
      'badge.tool': 'tool',
      'badge.current': 'current',
      'status.running': 'running',
      'status.pending': 'needs input',
      'status.done': 'done',
      'status.blank': 'new',
      'status.idle': 'idle',
      'hint.move': 'move',
      'hint.open': 'open',
      'hint.clear': 'clear',
      'hint.close': 'close',
      'aria.dialog': 'Telescope session search',
      'aria.input': 'Search sessions',
      'aria.list': 'Session results',
      'aria.close': 'Close search',
      'time.now': 'just now',
      'time.minutes': '{n}m ago',
      'time.hours': '{n}h ago',
      'time.days': '{n}d ago',
    }

    const zh = {
      'open.label': '搜索会话',
      'trigger.label': '搜索',
      'command.label': 'Telescope 搜索',
      'command.blocked': '请先关闭当前对话框',
      'mode.title': 'Telescope',
      'mode.scope': '会话',
      'prompt.placeholder': '模糊搜索会话…',
      'results.count': '{n} 条结果',
      'results.countOne': '1 条结果',
      'results.recent': '最近会话',
      'results.mode': '标题 / 路径 / 正文 · 模糊匹配',
      'results.searching': '正在搜索正文…',
      'results.unavailable': '正文搜索暂不可用',
      'empty.noSessions': '暂无会话',
      'empty.noMatches': '没有匹配“{q}”的会话',
      'empty.hint': '可以搜标题、工作区、路径，或消息正文里的任意词。',
      'empty.idle': '打开一个会话后就会开始积累历史。',
      'preview.title': '预览',
      'preview.workspace': '工作区',
      'preview.path': '路径',
      'preview.body': '正文匹配',
      'preview.meta': '标题 / 路径匹配',
      'preview.metaAndBody': '标题 / 路径命中 · 正文也有',
      'preview.alsoBody': '正文也有命中',
      'preview.alsoTool': '工具调用',
      'preview.session': '会话',
      'preview.noContent': '这条只命中了标题或路径，Host 没有返回正文片段。',
      'preview.tool': '工具调用',
      'preview.structured': '结构化参数',
      'preview.truncated': '片段到此截断',
      'preview.openHint': 'Host 片段有长度上限；按 Enter 打开会话查看完整上下文。',
      'preview.searchFailed': '正文搜索失败',
      'preview.searchingBody': '正在搜索正文…',
      'preview.empty': '选择一条结果查看预览',
      'preview.emptyHint': '↑ ↓ 移动 · Enter 打开',
      'badge.content': '正文',
      'badge.tool': '工具',
      'badge.current': '当前',
      'status.running': '运行中',
      'status.pending': '等待输入',
      'status.done': '已完成',
      'status.blank': '新会话',
      'status.idle': '空闲',
      'hint.move': '移动',
      'hint.open': '打开',
      'hint.clear': '清空',
      'hint.close': '关闭',
      'aria.dialog': 'Telescope 会话搜索',
      'aria.input': '搜索会话',
      'aria.list': '会话结果',
      'aria.close': '关闭搜索',
      'time.now': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
    }

    // ---------------------------------------------------------------------
    // Pure helpers
    // ---------------------------------------------------------------------

    /** External open/close store shared by the overlay, the trigger and the shortcut. */
    function createController() {
      let state = { open: false, token: 0 }
      const listeners = new Set()
      const emit = () => {
        for (const listener of listeners) listener()
      }
      const open = () => {
        if (state.open) return
        state = { open: true, token: state.token + 1 }
        emit()
      }
      const close = () => {
        if (!state.open) return
        state = { open: false, token: state.token }
        emit()
      }
      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        getSnapshot() { return state },
        open,
        close,
        toggle() { if (state.open) close(); else open() },
      }
    }

    /** Keep the query inside the Host's `session.search` wire bound. */
    function sanitizeQuery(value) {
      return String(value).replace(/\u0000/g, '').slice(0, 500)
    }

    /** Plain text for a transport/business error object. */
    function errorText(error) {
      if (error === null || error === undefined) return ''
      if (typeof error === 'string') return error
      if (typeof error.message === 'string') return error.message
      try { return JSON.stringify(error) } catch { return String(error) }
    }

    /** Relative time copy; the clock is read at render time. */
    function relativeTime(updatedAt, t, now) {
      if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return '—'
      const minutes = Math.floor(Math.max(0, now - updatedAt) / 60000)
      if (minutes < 1) return t('time.now')
      if (minutes < 60) return t('time.minutes', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('time.hours', { n: hours })
      return t('time.days', { n: Math.floor(hours / 24) })
    }

    /** Basename of a host path, without a trailing separator. */
    function baseName(path) {
      if (typeof path !== 'string' || path === '') return ''
      const trimmed = path.replace(/[\\/]+$/, '')
      const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
      return index === -1 ? trimmed : trimmed.slice(index + 1)
    }

    /**
     * Score one query token against a lower-cased field.
     * A subsequence match is required; word starts, consecutive runs and
     * early positions raise the score, long fields are penalized.
     * @returns score and matched character indices, or null.
     */
    function scoreToken(text, token) {
      const indices = []
      let position = 0
      for (let i = 0; i < token.length; i++) {
        const found = text.indexOf(token[i], position)
        if (found === -1) return null
        indices.push(found)
        position = found + 1
      }
      let score = 30
      if (indices[0] === 0) score += 20
      if (text.startsWith(token)) score += 25
      for (let i = 0; i < indices.length; i++) {
        const at = indices[i]
        if (i > 0 && at === indices[i - 1] + 1) score += 8
        if (at === 0) {
          score += 6
        } else {
          const previous = text[at - 1]
          if (previous === '/' || previous === '\\' || previous === '-' || previous === '_' ||
            previous === ' ' || previous === '.' || previous === ':' || previous === '(') {
            score += 6
          }
        }
      }
      score -= Math.min(text.length, 160) * 0.12
      return { score, indices }
    }

    /**
     * Fold the session feed, the workspace feed and the Host content-search
     * page into the row list the dialog renders.
     */
    function buildRows(sessions, workspaces, statuses, query, remote) {
      const sessionIds = (sessions && sessions.ids) || []
      const summaries = (sessions && sessions.byId) || {}
      const items = (workspaces && workspaces.items) || []
      const archived = new Set((workspaces && workspaces.archivedSessionIds) || [])

      const workspaceBySession = new Map()
      for (const workspace of items) {
        for (const sessionId of workspace.sessionIds || []) {
          workspaceBySession.set(sessionId, workspace)
        }
      }

      const entries = []
      const entryById = new Map()
      for (const id of sessionIds) {
        if (archived.has(id)) continue
        const summary = summaries[id]
        if (summary === undefined) continue
        const workspace = workspaceBySession.get(id)
        const cwd = summary.cwd || (workspace && workspace.path) || ''
        const status = statuses !== null && statuses !== undefined && typeof statuses.get === 'function'
          ? statuses.get(id)
          : undefined
        const entry = {
          id,
          title: summary.displayTitle || summary.title || id,
          workspace: workspace ? workspace.title : '',
          cwd,
          pathBase: baseName(cwd),
          updatedAt: summary.updatedAt || 0,
          running: (status !== undefined && status !== null && status.running === true) || summary.running === true,
          pending: status !== undefined && status !== null && status.pendingInteraction !== undefined && status.pendingInteraction !== null,
          completed: status !== undefined && status !== null && status.completionUnread === true,
          blank: summary.blank === true,
          current: (summary.retainedBy !== undefined && summary.retainedBy !== null && (summary.retainedBy.mainView || 0) > 0),
          snippet: '',
          contentMatch: false,
          localMatch: false,
          toolSnippet: false,
          score: 0,
          highlights: null,
        }
        entries.push(entry)
        entryById.set(id, entry)
      }

      const trimmed = query.trim()
      const tokens = trimmed === '' ? [] : trimmed.toLowerCase().split(/\s+/)
      const results = []

      if (tokens.length === 0) {
        const recent = entries.slice()
        recent.sort((a, b) => (Number(b.current) - Number(a.current)) || (b.updatedAt - a.updatedAt))
        return recent.slice(0, MAX_RECENT)
      }

      for (const entry of entries) {
        // Local fields are weighted so a title hit outranks workspace/path and
        // every body-only hit (those keep score 0 below). The Host's content
        // index exposes no event type, so user/assistant/tool body hits cannot
        // be re-weighted here; reasoning is not indexed by the Host at all.
        const fields = [
          [entry.title.toLowerCase(), 1.25, 'title'],
          [entry.workspace.toLowerCase(), 0.8, 'workspace'],
          [entry.pathBase.toLowerCase(), 0.75, 'base'],
          [entry.cwd.toLowerCase(), 0.55, 'path'],
        ]
        let total = 0
        let matched = true
        const highlights = new Set()
        for (const token of tokens) {
          let best = null
          for (const [text, weight, field] of fields) {
            if (text === '') continue
            const hit = scoreToken(text, token)
            if (hit === null) continue
            const weighted = hit.score * weight
            if (best === null || weighted > best.weighted) {
              best = { weighted, field, indices: hit.indices }
            }
          }
          if (best === null) {
            matched = false
            break
          }
          total += best.weighted
          if (best.field === 'title') {
            for (const index of best.indices) highlights.add(index)
          }
        }
        if (!matched) continue
        entry.localMatch = true
        const remoteItem = remote.items instanceof Map ? remote.items.get(entry.id) : undefined
        if (remoteItem !== undefined) {
          entry.contentMatch = true
          entry.snippet = String(remoteItem.snippet || '').trim()
          entry.toolSnippet = isToolSnippet(entry.snippet)
        }
        entry.score = total
        entry.highlights = highlights.size > 0 ? highlights : null
        results.push(entry)
      }

      // Content-only hits: the title/path did not match, the message text did.
      if (remote.items instanceof Map) {
        for (const [sessionId, remoteItem] of remote.items) {
          if (entryById.has(sessionId) && results.some(row => row.id === sessionId)) continue
          const entry = entryById.get(sessionId)
          if (entry === undefined) continue
          if (entry.contentMatch && results.some(row => row.id === sessionId)) continue
          entry.contentMatch = true
          entry.snippet = String(remoteItem.snippet || '').trim()
          entry.toolSnippet = isToolSnippet(entry.snippet)
          entry.score = 0
          results.push(entry)
        }
      }

      results.sort((a, b) => (b.score - a.score) || (b.updatedAt - a.updatedAt))
      return results.slice(0, MAX_ROWS)
    }

    /** Status descriptor for one row, or null when the session is resting. */
    function statusOf(entry) {
      if (entry.pending) return { kind: 'pending', key: 'status.pending' }
      if (entry.running) return { kind: 'running', key: 'status.running' }
      if (entry.blank) return { kind: 'blank', key: 'status.blank' }
      if (entry.completed) return { kind: 'done', key: 'status.done' }
      return null
    }

    /** Render a title with matched character positions emphasized. */
    function renderHighlighted(title, highlights) {
      if (highlights === null || highlights === undefined || highlights.size === 0) return title
      const parts = []
      let plain = ''
      for (let i = 0; i < title.length; i++) {
        if (highlights.has(i)) {
          if (plain !== '') {
            parts.push(h('span', { key: 'p' + i }, plain))
            plain = ''
          }
          parts.push(h('span', { key: 'h' + i, className: 'tsl-hit' }, title[i]))
        } else {
          plain += title[i]
        }
      }
      if (plain !== '') parts.push(h('span', { key: 'p' + title.length }, plain))
      return parts
    }

    /** Escape one literal string for use inside a RegExp. */
    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    // ---------------------------------------------------------------------
    // Host excerpt formatting
    //
    // The FTS index stores whole semantic events, so a body hit can land inside
    // a tool call. The Host then hands back a plain 240-character window such as
    //   bash {"command":"osascript -e 'tell application ..."}
    // Printed as-is that is unreadable. The parser below splits the window into
    // prose and structured argument blocks, then renders the latter as labelled
    // fields / code rather than a raw JSON line.
    // ---------------------------------------------------------------------

    /** Argument keys whose string values read better as code blocks. */
    const CODE_VALUE_KEYS = new Set([
      'command', 'cmd', 'script', 'patch', 'diff', 'code', 'content', 'new_string',
      'old_string', 'query', 'pattern', 'regex', 'path', 'file', 'url',
    ])

    /** Tool names whose payloads appear in session transcripts (snake_case is always accepted). */
    const TOOL_NAMES = new Set([
      'ask_user_question', 'apply_patch', 'bash', 'browser', 'edit', 'glob', 'grep',
      'job', 'jobs', 'node', 'python', 'read', 'skill', 'subagent', 'task',
      'terminal', 'todo', 'view_image', 'web_fetch', 'web_search', 'workflow', 'write',
    ])

    /** Preferred keys when summarising a tool-call snippet in one line. */
    const SUMMARY_KEYS = ['header', 'title', 'question', 'description', 'command', 'query', 'path', 'text']

    /** Maximum nesting depth expanded inline before falling back to a count. */
    const JSON_DEPTH_LIMIT = 4

    /**
     * True when a lowercase word right before a JSON body reads as a tool name.
     * Plain English words are rejected unless known, so prose ending in
     * "fragment" or "before" does not become a fake tool header.
     */
    function looksLikeToolName(word) {
      if (!/^[a-z][a-z0-9_.-]{1,39}$/.test(word)) return false
      return word.includes('_') || word.includes('-') || TOOL_NAMES.has(word)
    }

    /** First `{` or `[` at or after `from`. */
    function nextJsonOpener(text, from) {
      for (let index = from; index < text.length; index++) {
        const character = text[index]
        if (character === '{' || character === '[') return index
      }
      return -1
    }

    /** End (exclusive) of the balanced JSON value at `start`, or -1. */
    function balancedJsonEnd(text, start) {
      const stack = [text[start] === '{' ? '}' : ']']
      let inString = false
      let escape = false
      for (let index = start + 1; index < text.length; index++) {
        const character = text[index]
        if (inString) {
          if (escape) { escape = false; continue }
          if (character === '\\') { escape = true; continue }
          if (character === '"') inString = false
          continue
        }
        if (character === '"') { inString = true; continue }
        if (character === '{') stack.push('}')
        else if (character === '[') stack.push(']')
        else if (character === '}' || character === ']') {
          if (stack[stack.length - 1] !== character) return -1
          stack.pop()
          if (stack.length === 0) return index + 1
        }
      }
      return -1
    }

    /**
     * Best-effort parse of a JSON value cut off at the excerpt boundary: close
     * the open string and containers, then parse the repaired prefix.
     * @returns the parsed value, or `undefined` when the fragment is not JSON.
     */
    function repairJsonFragment(fragment) {
      let inString = false
      let escape = false
      const stack = []
      for (let index = 0; index < fragment.length; index++) {
        const character = fragment[index]
        if (inString) {
          if (escape) { escape = false; continue }
          if (character === '\\') { escape = true; continue }
          if (character === '"') inString = false
          continue
        }
        if (character === '"') { inString = true; continue }
        if (character === '{') stack.push('}')
        else if (character === '[') stack.push(']')
        else if (character === '}' || character === ']') {
          if (stack[stack.length - 1] !== character) return undefined
          stack.pop()
        }
      }
      if (stack.length === 0 && !inString) return undefined
      let repaired = escape ? fragment.slice(0, -1) : fragment
      if (inString) repaired += '"'
      repaired = repaired.replace(/[\s,]+$/u, '')
      if (repaired.endsWith(':')) repaired += 'null'
      for (let index = stack.length - 1; index >= 0; index--) repaired += stack[index]
      try {
        return JSON.parse(repaired)
      } catch (_error) {
        return undefined
      }
    }

    /** Parse one JSON object/array starting at `start`. */
    function parseJsonAt(text, start) {
      const exact = balancedJsonEnd(text, start)
      if (exact !== -1) {
        try {
          const value = JSON.parse(text.slice(start, exact))
          if (value !== null && typeof value === 'object') return { value, end: exact, truncated: false }
        } catch (_error) { /* try the truncated-repair path below */ }
      }
      const repaired = repairJsonFragment(text.slice(start))
      if (repaired === null || repaired === undefined || typeof repaired !== 'object') return null
      return { value: repaired, end: text.length, truncated: true }
    }

    /**
     * Split a Host excerpt into plain prose and structured JSON bodies. Adjacent
     * prose stays one segment; a lowercase word directly before a JSON body is
     * reported as that segment's tool name.
     */
    function splitExcerpt(text) {
      const source = String(text)
      const segments = []
      let pending = 0
      let searchFrom = 0
      for (;;) {
        const opener = nextJsonOpener(source, searchFrom)
        if (opener === -1) break
        const parsed = parseJsonAt(source, opener)
        if (parsed === null) {
          // Not JSON (a brace in prose): keep scanning after it, but leave the
          // prose pending so the next accepted block still carries it.
          searchFrom = opener + 1
          continue
        }
        let prose = source.slice(pending, opener)
        // A markdown code fence directly before the body is decoration, not
        // context: drop it so the expanded card does not sit under "```json".
        const fenced = /```[A-Za-z0-9_-]*\s*$/u.test(prose)
        if (fenced) prose = prose.replace(/```[A-Za-z0-9_-]*\s*$/u, '')
        let tool = ''
        const match = fenced ? null : prose.match(/([a-z][a-z0-9_.-]{1,39})\s*$/)
        if (match !== null && looksLikeToolName(match[1])) {
          tool = match[1]
          prose = prose.slice(0, prose.length - match[0].length)
        }
        if (prose !== '') segments.push({ kind: 'text', text: prose })
        segments.push({ kind: 'json', tool, value: parsed.value, truncated: parsed.truncated })
        pending = parsed.end
        // Skip the matching closing fence when the excerpt is complete.
        const fence = source.slice(pending).match(/^\s*```/u)
        if (fence !== null) pending += fence[0].length
        searchFrom = pending
      }
      if (pending < source.length) segments.push({ kind: 'text', text: source.slice(pending) })
      return segments
    }

    /** Emphasize exact query-token occurrences inside an excerpt (or a value). */
    function highlightTokens(text, tokens) {
      if (tokens.length === 0) return text
      const pattern = new RegExp('(' + tokens.map(escapeRegExp).join('|') + ')', 'gi')
      return String(text).split(pattern).map((part, index) =>
        index % 2 === 1 ? h('mark', { key: index, className: 'tsl-excerpt-hit' }, part) : part)
    }

    /** Long commands and multiline content read better in a code block. */
    function isCodeValue(keyName, value) {
      if (value.includes('\n')) return true
      if (CODE_VALUE_KEYS.has(keyName)) return true
      return value.length > 120 && /[;|&$`]/.test(value)
    }

    /** Recursively render one parsed JSON value with readable typography. */
    function renderJsonValue(value, tokens, depth, keyName) {
      if (value === null) return h('span', { className: 'tsl-json-atom' }, 'null')
      if (typeof value === 'string') {
        if (value === '') return h('span', { className: 'tsl-json-atom' }, '(empty)')
        if (isCodeValue(keyName, value)) return h('pre', { className: 'tsl-code' }, highlightTokens(value, tokens))
        return h('span', { className: 'tsl-json-string' }, highlightTokens(value, tokens))
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return h('span', { className: 'tsl-json-atom' }, String(value))
      }
      if (Array.isArray(value)) {
        if (value.length === 0) return h('span', { className: 'tsl-json-atom' }, '[]')
        const primitive = value.every(item => item === null || typeof item !== 'object')
        if (primitive) {
          return h('div', { className: 'tsl-json-chips' }, value.map((item, index) =>
            h('span', { key: index, className: 'tsl-json-chip' }, renderJsonValue(item, tokens, depth + 1, keyName))))
        }
        if (depth >= JSON_DEPTH_LIMIT) return h('span', { className: 'tsl-json-atom' }, '[' + value.length + ' items]')
        return h('ol', { className: 'tsl-json-list' }, value.map((item, index) =>
          h('li', { key: index, className: 'tsl-json-item' }, renderJsonValue(item, tokens, depth + 1, keyName))))
      }
      if (typeof value === 'object') {
        const entries = Object.entries(value)
        if (entries.length === 0) return h('span', { className: 'tsl-json-atom' }, '{}')
        if (depth >= JSON_DEPTH_LIMIT) return h('span', { className: 'tsl-json-atom' }, '{' + entries.length + ' fields}')
        return h('dl', { className: 'tsl-json-fields' }, entries.map(([childKey, childValue], index) =>
          h('div', { key: childKey + index, className: 'tsl-json-field' },
            h('dt', { className: 'tsl-json-key' }, childKey),
            h('dd', { className: 'tsl-json-value' }, renderJsonValue(childValue, tokens, depth + 1, childKey)))))
      }
      return String(value)
    }

    /** Render one structured argument block with its tool name. */
    function renderToolSegment(segment, tokens, labels, key) {
      return h('section', { key, className: 'tsl-tool' },
        h('div', { className: 'tsl-tool-head' },
          h('span', null, segment.tool !== '' ? labels.tool : labels.structured),
          segment.tool !== '' ? h('span', { className: 'tsl-tool-name' }, segment.tool) : null,
          segment.truncated ? h('span', { className: 'tsl-tool-trunc' }, labels.truncated) : null),
        h('div', { className: 'tsl-tool-body' }, renderJsonValue(segment.value, tokens, 0, '')))
    }

    /**
     * Render the Host excerpt as readable context: prose as prose, tool-call
     * arguments as expanded labelled fields, query terms emphasized throughout.
     */
    function renderExcerpt(text, tokens, labels) {
      const active = tokens
        .map(token => token.trim())
        .filter(token => token !== '')
        .sort((left, right) => right.length - left.length)
      const segments = splitExcerpt(text)
      if (segments.length === 0) return h('div', { className: 'tsl-prose' }, highlightTokens(String(text), active))
      return h('div', { className: 'tsl-excerpt-inner' }, segments.map((segment, index) =>
        segment.kind === 'text'
          ? h('div', { key: 't' + index, className: 'tsl-prose' }, highlightTokens(segment.text, active))
          : renderToolSegment(segment, active, labels, 'j' + index)))
    }

    /** Preferred human-readable string inside one parsed tool-call payload. */
    function preferredString(value, depth) {
      if (typeof value === 'string') return value
      if (value === null || typeof value !== 'object' || depth > 3) return ''
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = preferredString(item, depth + 1)
          if (found !== '') return found
        }
        return ''
      }
      for (const key of SUMMARY_KEYS) {
        const candidate = value[key]
        if (typeof candidate === 'string' && candidate.trim() !== '') return candidate
      }
      for (const candidate of Object.values(value)) {
        const found = preferredString(candidate, depth + 1)
        if (found !== '') return found
      }
      return ''
    }

    /** True when the Host excerpt contains any JSON/structured block. */
    function hasStructuredSnippet(text) {
      if (text === null || text === undefined || text === '') return false
      return splitExcerpt(String(text)).some(segment => segment.kind === 'json')
    }

    /** True when the Host excerpt contains a named tool-call argument block. */
    function isToolSnippet(text) {
      if (text === null || text === undefined || text === '') return false
      return splitExcerpt(String(text)).some(segment => segment.kind === 'json' && segment.tool !== '')
    }

    /**
     * One-line list-row summary: structured snippets become
     * `tool · first meaningful argument` instead of raw JSON.
     */
    function summarizeSnippet(text) {
      const segments = splitExcerpt(text)
      const structured = segments.find(segment => segment.kind === 'json')
      if (structured !== undefined) {
        const name = structured.tool === '' ? 'JSON' : structured.tool
        const detail = preferredString(structured.value, 0).replace(/\s+/gu, ' ').trim()
        return detail === '' ? name : name + ' · ' + detail
      }
      return String(text).replace(/\s+/gu, ' ').trim()
    }

    // ---------------------------------------------------------------------
    // Icons
    // ---------------------------------------------------------------------

    function SearchGlyph({ size }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
        'aria-hidden': true, focusable: false, style: { display: 'block', flex: 'none' },
      },
      h('circle', { cx: 6.8, cy: 6.8, r: 4.3 }),
      h('path', { d: 'M10 10l3.4 3.4' }))
    }

    function ScopeGlyph({ size }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round',
        'aria-hidden': true, focusable: false, style: { display: 'block', flex: 'none' },
      },
      h('circle', { cx: 8, cy: 8, r: 5.2 }),
      h('path', { d: 'M8 0.9v2.6M8 12.5v2.6M0.9 8h2.6M12.5 8h2.6' }),
      h('circle', { cx: 8, cy: 8, r: 1.3, fill: 'currentColor', stroke: 'none' }))
    }

    // ---------------------------------------------------------------------
    // Components
    // ---------------------------------------------------------------------

    /** Read this command's effective keys from the shared shortcut catalog. */
    function useShortcutBinding(catalog) {
      const usable = catalog !== undefined && catalog !== null
        && typeof catalog.subscribe === 'function' && typeof catalog.getSnapshot === 'function'
      const snapshot = React.useSyncExternalStore(
        usable ? catalog.subscribe : NOOP_SUBSCRIBE,
        usable ? catalog.getSnapshot : EMPTY_CATALOG,
      )
      const row = Array.isArray(snapshot)
        ? snapshot.find(entry => entry.id === COMMAND_ID)
        : undefined
      const keys = row !== undefined && Array.isArray(row.keys) && row.keys.length > 0 ? row.keys : null
      return { keys, aria: row === undefined ? undefined : row.aria }
    }

    /** Keycap text: compact symbols on macOS, plus-joined names elsewhere. */
    function formatKeys(keys) {
      if (keys === null || keys === undefined || keys.length === 0) return ''
      return IS_APPLE ? keys.join('') : keys.join('+')
    }

    /** Compare two normalized shortcut bindings (null means unbound). */
    function sameBinding(left, right) {
      if (left === null || left === undefined || right === null || right === undefined) {
        return left === null || left === undefined ? right === null || right === undefined : false
      }
      return left.code === right.code
        && (left.secondCode === undefined ? '' : left.secondCode) === (right.secondCode === undefined ? '' : right.secondCode)
        && left.modifiers.join('+') === right.modifiers.join('+')
    }

    /** Always-mounted overlay entry: subscribes only while closed. */
    function TelescopeOverlay(props) {
      const state = React.useSyncExternalStore(
        props.controller.subscribe,
        props.controller.getSnapshot,
      )
      if (!state.open) return null
      return h(TelescopeDialog, Object.assign({}, props, { key: 'telescope-' + state.token }))
    }

    /** The floating finder itself. */
    function TelescopeDialog(props) {
      const { useSessions, useWorkspaces, useSessionStatus, t, controller, api } = props
      const sessions = useSessions(state => state)
      const workspaces = useWorkspaces(state => state)
      const statuses = useSessionStatus(state => state)

      const [query, setQuery] = React.useState('')
      const [active, setActive] = React.useState(0)
      const [remote, setRemote] = React.useState({ query: '', status: 'idle', items: new Map(), hasMore: false, error: '' })

      const inputRef = React.useRef(null)
      const listRef = React.useRef(null)
      const panelRef = React.useRef(null)

      const trimmed = query.trim()
      const queryTokens = trimmed === '' ? [] : trimmed.split(/\s+/)
      const now = Date.now()

      // Focus on open, restore the opener on close.
      React.useEffect(() => {
        const previous = document.activeElement
        const panel = panelRef.current
        inputRef.current?.focus({ preventScroll: true })
        return () => {
          if (previous !== null && previous !== undefined && previous.isConnected && typeof previous.focus === 'function') {
            const current = document.activeElement
            if (current === null || current === document.body || (panel !== null && panel.contains(current))) {
              previous.focus({ preventScroll: true })
            }
          }
        }
      }, [])

      // Host content search, debounced; superseded requests are aborted.
      React.useEffect(() => {
        if (trimmed === '') {
          setRemote({ query: '', status: 'idle', items: new Map(), hasMore: false, error: '' })
          return
        }
        const abort = new AbortController()
        setRemote(previous => ({
          query: trimmed,
          status: 'loading',
          items: previous.query === trimmed ? previous.items : new Map(),
          hasMore: false,
          error: '',
        }))
        const timer = window.setTimeout(() => {
          Promise.resolve().then(() => api.search(trimmed, abort.signal)).then(result => {
            if (abort.signal.aborted) return
            if (result && result.ok) {
              const items = new Map()
              for (const item of result.value.items || []) items.set(item.sessionId, item)
              setRemote({ query: trimmed, status: 'ready', items, hasMore: result.value.hasMore === true, error: '' })
            } else {
              setRemote({ query: trimmed, status: 'error', items: new Map(), hasMore: false, error: errorText(result === null || result === undefined ? undefined : result.error) })
            }
          }).catch((error) => {
            if (!abort.signal.aborted) {
              setRemote({ query: trimmed, status: 'error', items: new Map(), hasMore: false, error: errorText(error) })
            }
          })
        }, SEARCH_DEBOUNCE_MS)
        return () => {
          window.clearTimeout(timer)
          abort.abort()
        }
      }, [trimmed, api])

      const remoteForRows = remote.query === trimmed ? remote : { query: trimmed, status: 'loading', items: new Map(), hasMore: false }
      const rows = React.useMemo(
        () => buildRows(sessions, workspaces, statuses, trimmed, remoteForRows),
        [sessions, workspaces, statuses, trimmed, remoteForRows],
      )

      const shortcut = useShortcutBinding(props.shortcutCatalog)
      const shortcutText = shortcut.keys === null ? '' : formatKeys(shortcut.keys)

      const activeRow = rows.length === 0 ? null : rows[Math.min(active, rows.length - 1)]

      React.useEffect(() => { setActive(0) }, [trimmed])
      React.useEffect(() => {
        setActive(current => rows.length === 0 ? 0 : Math.min(current, rows.length - 1))
      }, [rows.length])

      React.useEffect(() => {
        const selected = listRef.current?.querySelector('[data-active="true"]')
        if (selected !== null && selected !== undefined) selected.scrollIntoView({ block: 'nearest' })
      }, [active, rows.length])

      const close = () => { controller.close() }

      /** Return keyboard ownership to the prompt (the finder's one input). */
      const focusPrompt = () => {
        const input = inputRef.current
        if (input !== null && input !== undefined) input.focus({ preventScroll: true })
      }

      const choose = (index) => {
        const row = rows[index]
        if (row === undefined) return
        api.openSession(row.id)
        close()
      }

      const move = (delta) => {
        if (rows.length === 0) return
        setActive(current => {
          const next = current + delta
          if (next < 0) return rows.length - 1
          if (next >= rows.length) return 0
          return next
        })
      }

      const onKeyDown = (event) => {
        if (event.key === 'Tab') {
          // Telescope binds Tab to multi-selection; this finder has no
          // multi-selection, and the modal is keyboard-first. Letting the
          // browser walk Tab into the page behind the scrim would leave typing
          // and the arrow keys pointed at controls the operator cannot see.
          // Keep ownership on the prompt; Esc is the escape hatch.
          event.preventDefault()
          focusPrompt()
          return
        }
        if (event.isComposing) return
        const modifier = event.ctrlKey || event.metaKey
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          move(1)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          move(-1)
          return
        }
        if (modifier && !event.shiftKey && !event.altKey && (event.key === 'n' || event.key === 'N')) {
          event.preventDefault()
          move(1)
          return
        }
        if (modifier && !event.shiftKey && !event.altKey && (event.key === 'p' || event.key === 'P')) {
          event.preventDefault()
          move(-1)
          return
        }
        if (event.key === 'PageDown') {
          event.preventDefault()
          move(8)
          return
        }
        if (event.key === 'PageUp') {
          event.preventDefault()
          move(-8)
          return
        }
        if (event.key === 'Enter') {
          // A focused chrome button (the close affordance) keeps its own Enter.
          if (event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') return
          event.preventDefault()
          choose(active)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close()
          return
        }
        if (event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && (event.key === 'u' || event.key === 'U')) {
          event.preventDefault()
          setQuery('')
          return
        }
      }

      const busy = trimmed !== '' && remote.status === 'loading'
      // Why the active row is in the list. A title/path hit with an incidental
      // body hit must not present itself as a pure "body match": the excerpt
      // may be a tool call that has little to do with the title that matched.
      const activeLocal = activeRow !== null && activeRow.localMatch === true
      const activeBody = activeRow !== null && activeRow.snippet !== ''
      const activeStructured = activeBody && hasStructuredSnippet(activeRow.snippet)
      const activeTool = activeBody && activeRow.toolSnippet === true
      const failed = trimmed !== '' && remote.status === 'error'
      const countText = rows.length === 1 && !remote.hasMore
        ? t('results.countOne')
        : t('results.count', { n: remote.hasMore ? rows.length + '+' : rows.length })
      const statusText = failed
        ? t('results.unavailable')
        : busy
          ? t('results.searching')
          : trimmed === ''
            ? t('results.recent')
            : t('results.mode')

      return h('div', {
        className: 'tsl-scrim',
        onMouseDown: event => { if (event.target === event.currentTarget) close() },
      },
      h('div', {
        ref: panelRef,
        className: 'tsl-panel',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('aria.dialog'),
        'data-shortcut-modal': 'telescope',
        onKeyDown,
      },
      h('div', { className: 'tsl-strip' },
        h(ScopeGlyph, { size: 13 }),
        h('span', { className: 'tsl-strip-title' }, t('mode.title')),
        h('span', { className: 'tsl-strip-sep' }, '·'),
        h('span', { className: 'tsl-strip-scope' }, t('mode.scope')),
        h('span', { className: 'tsl-spacer' }),
        h('span', { className: 'tsl-strip-hint' }, shortcutText),
        h('button', {
          type: 'button',
          className: 'tsl-close',
          'aria-label': t('aria.close'),
          onClick: close,
        }, '×'),
      ),
      h('div', { className: 'tsl-prompt' },
        h('span', { className: 'tsl-caret', 'aria-hidden': 'true' }, '>'),
        h('input', {
          ref: inputRef,
          className: 'tsl-input',
          type: 'text',
          role: 'combobox',
          value: query,
          placeholder: t('prompt.placeholder'),
          'aria-label': t('aria.input'),
          'aria-expanded': 'true',
          'aria-controls': 'tsl-listbox',
          'aria-autocomplete': 'list',
          'aria-activedescendant': activeRow === null ? undefined : 'tsl-option-' + Math.min(active, rows.length - 1),
          autoComplete: 'off',
          autoCorrect: 'off',
          spellCheck: false,
          onChange: event => { setQuery(sanitizeQuery(event.target.value)) },
        }),
        h('span', { className: 'tsl-count' + (busy ? ' is-busy' : '') }, countText),
      ),
      h('div', { className: 'tsl-body' },
        h('div', {
          ref: listRef,
          id: 'tsl-listbox',
          className: 'tsl-list',
          role: 'listbox',
          'aria-label': t('aria.list'),
        },
        rows.length === 0
          ? h('div', { className: 'tsl-empty' },
            h('span', { className: 'tsl-glyph' }, h(ScopeGlyph, { size: 30 })),
            h('div', { className: 'tsl-empty-title' },
              busy ? t('results.searching') : trimmed === '' ? t('empty.noSessions') : t('empty.noMatches', { q: trimmed })),
            h('div', null, trimmed === '' ? t('empty.idle') : t('empty.hint')),
          )
          : rows.map((row, index) => {
            const status = statusOf(row)
            const meta = row.workspace !== '' ? row.workspace : row.pathBase || row.cwd
            return h('div', {
              key: row.id,
              id: 'tsl-option-' + index,
              role: 'option',
              'aria-selected': index === active,
              'data-active': index === active ? 'true' : undefined,
              className: 'tsl-row' + (index === active ? ' is-active' : ''),
              title: row.title,
              onClick: () => { choose(index) },
              onMouseEnter: () => { setActive(index) },
            },
            h('div', { className: 'tsl-row-top' },
              status !== null ? h('span', { className: 'tsl-dot is-' + status.kind, 'aria-hidden': 'true' }) : null,
              h('span', { className: 'tsl-row-title' }, renderHighlighted(row.title, row.highlights)),
              row.contentMatch && !row.localMatch
                ? h('span', { className: 'tsl-badge is-content' }, t(row.toolSnippet ? 'badge.tool' : 'badge.content'))
                : null,
              row.current ? h('span', { className: 'tsl-badge is-current' }, t('badge.current')) : null,
              h('span', { className: 'tsl-row-meta' },
                (meta !== '' ? meta + ' · ' : '') + relativeTime(row.updatedAt, t, now)),
            ),
            h('div', { className: 'tsl-row-sub' },
              row.localMatch || row.snippet === '' ? row.cwd : summarizeSnippet(row.snippet)));
          })),
        h('aside', { className: 'tsl-preview', 'aria-label': t('preview.title') },
          activeRow === null
            ? h('div', { className: 'tsl-pv-empty' },
              h('span', { className: 'tsl-glyph' }, h(ScopeGlyph, { size: 26 })),
              h('div', null, t('preview.empty')),
              h('div', null, t('preview.emptyHint')))
            : h(React.Fragment, null,
              h('div', { className: 'tsl-eyebrow' },
                activeLocal
                  ? (activeBody ? t('preview.metaAndBody') : t('preview.meta'))
                  : (activeBody ? t('preview.body') : t('preview.session'))),
              h('div', { className: 'tsl-pv-title' }, renderHighlighted(activeRow.title, activeRow.highlights)),
              h('div', { className: 'tsl-pv-sub' },
                [activeRow.workspace, relativeTime(activeRow.updatedAt, t, now)]
                  .filter(part => part !== '')
                  .join(' · ')),
              h('div', { className: 'tsl-pv-badges' },
                activeRow.current ? h('span', { className: 'tsl-badge is-current' }, t('badge.current')) : null,
                h('span', { className: 'tsl-badge' }, t((statusOf(activeRow) || { key: 'status.idle' }).key))),
              activeBody && !(activeLocal && activeStructured)
                ? h('div', { className: 'tsl-body-match' },
                  activeLocal ? h('div', { className: 'tsl-excerpt-label' }, t('preview.alsoBody')) : null,
                  h('div', { className: 'tsl-excerpt' }, renderExcerpt(activeRow.snippet, queryTokens, {
                    tool: t('preview.tool'),
                    structured: t('preview.structured'),
                    truncated: t('preview.truncated'),
                  })))
                : activeBody
                  ? h('div', { className: 'tsl-body-note' },
                    h('div', { className: 'tsl-excerpt-label' }, t('preview.alsoBody')),
                    h('div', { className: 'tsl-body-note-line' },
                      h('span', { className: 'tsl-body-note-source' },
                        activeTool ? t('preview.alsoTool') : t('preview.structured')),
                      h('span', { className: 'tsl-body-note-text' }, summarizeSnippet(activeRow.snippet))))
                  : trimmed !== '' && !activeLocal
                    ? h('div', { className: 'tsl-pv-note' },
                      failed
                        ? t('preview.searchFailed') + (remote.error !== '' ? ': ' + remote.error : '')
                        : busy
                          ? t('preview.searchingBody')
                          : t('preview.noContent'))
                    : null,
              activeBody && trimmed !== ''
                ? h('div', { className: 'tsl-pv-open-hint' }, t('preview.openHint'))
                : null,
              h('dl', { className: 'tsl-kv' },
                h('dt', { className: 'tsl-mono' }, t('preview.workspace')),
                h('dd', null, activeRow.workspace !== '' ? activeRow.workspace : '—'),
                h('dt', { className: 'tsl-mono' }, t('preview.path')),
                h('dd', { className: 'tsl-mono' }, activeRow.cwd !== '' ? activeRow.cwd : '—'))),
      )),
      h('div', { className: 'tsl-foot' },
        h('span', { className: 'tsl-hint' },
          h('kbd', { className: 'tsl-kbd' }, '↑'),
          h('kbd', { className: 'tsl-kbd' }, '↓'),
          h('span', null, t('hint.move'))),
        h('span', { className: 'tsl-hint' },
          h('kbd', { className: 'tsl-kbd' }, '↵'),
          h('span', null, t('hint.open'))),
        h('span', { className: 'tsl-hint' },
          h('kbd', { className: 'tsl-kbd' }, CLEAR_LABEL),
          h('span', null, t('hint.clear'))),
        h('span', { className: 'tsl-hint' },
          h('kbd', { className: 'tsl-kbd' }, 'esc'),
          h('span', null, t('hint.close'))),
        h('span', { className: 'tsl-spacer' }),
        h('span', {
          className: 'tsl-status' + (failed ? ' is-error' : busy ? ' is-busy' : ''),
          title: failed ? remote.error : undefined,
        }, statusText)),
      ))
    }

    /** Sidebar-foot trigger row (rail icon when the column is collapsed). */
    function TelescopeTrigger(props) {
      const { controller, t } = props
      const wide = props.wide !== false
      const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
      const shortcut = useShortcutBinding(props.shortcutCatalog)
      const label = t('open.label') + (shortcut.keys === null ? '' : ' (' + formatKeys(shortcut.keys) + ')')
      return h('button', {
        type: 'button',
        className: 'tsl-trigger' + (wide ? '' : ' is-rail'),
        'aria-label': label,
        'aria-keyshortcuts': shortcut.aria,
        'aria-haspopup': 'dialog',
        'aria-expanded': state.open,
        title: wide ? undefined : label,
        onClick: () => { controller.open() },
      },
      h(SearchGlyph, { size: wide ? 16 : 18 }),
      wide ? h('span', { className: 'tsl-trigger-label' }, t('trigger.label')) : null,
      wide && shortcut.keys !== null ? h('span', { className: 'tsl-trigger-kbd' }, formatKeys(shortcut.keys)) : null)
    }

    // ---------------------------------------------------------------------
    // Plugin body
    // ---------------------------------------------------------------------

    /**
     * One-time Desktop takeover of the built-in session-search chord.
     *
     * The shipped sidebar search owns `session.search` (Mod+K on Desktop) and
     * the shortcut service has no replace API. Moving the user's current
     * binding to `telescope.open` through the service's own preference edit is
     * the supported way to make that chord open Telescope. The operation is
     * idempotent, stored as a normal editable shortcut override, and therefore
     * visible and restorable in Settings → Keyboard shortcuts.
     *
     * Runs only in the Desktop runtime, only after the preference document is
     * ready and the workspace command catalog exists, and only once per
     * origin; the marker prevents a later "Restore Defaults" from being
     * silently overwritten again.
     */
    function installSearchShortcutTakeover(ctx) {
      const MARKER = 'dsh.telescope.takeover.v1'
      let done = false
      let running = false
      let offConfig
      let offCatalog

      const cleanup = () => {
        if (offConfig !== undefined) { offConfig(); offConfig = undefined }
        if (offCatalog !== undefined) { offCatalog(); offCatalog = undefined }
      }
      const mark = () => {
        try { window.localStorage.setItem(MARKER, '1') } catch { /* storage unavailable */ }
      }
      const marked = () => {
        try { return window.localStorage.getItem(MARKER) === '1' } catch { return false }
      }

      const attempt = async () => {
        if (done || running) return
        if (ctx.shortcuts.runtime !== 'desktop') { done = true; cleanup(); return }
        if (marked()) { done = true; cleanup(); return }
        const config = ctx.shortcuts.config.getSnapshot()
        if (config.status === 'loading') return
        if (config.status !== 'ready') { done = true; cleanup(); return }

        const rows = ctx.shortcuts.catalog.getSnapshot()
        const search = Array.isArray(rows) ? rows.find(row => row.id === 'session.search') : undefined
        // The workspace owner may not have published its command yet; wait for
        // the next catalog frame rather than deciding against a partial list.
        if (search === undefined) return

        running = true
        try {
          if (search.binding === null || search.binding === undefined) {
            mark()
            done = true
            cleanup()
            return
          }
          if (search.issue !== null && search.issue !== undefined) { done = true; cleanup(); return }
          if (Array.isArray(search.conflicts) && search.conflicts.length > 0) { done = true; cleanup(); return }

          const own = rows.find(row => row.id === COMMAND_ID)
          if (own !== undefined && sameBinding(own.binding, search.binding)) {
            mark()
            done = true
            cleanup()
            return
          }

          const target = {
            code: search.binding.code,
            modifiers: [...search.binding.modifiers],
            ...(search.binding.secondCode === undefined ? {} : { secondCode: search.binding.secondCode }),
          }
          const cleared = await ctx.shortcuts.edit(
            { type: 'set', id: 'session.search', binding: null },
            config.revision,
          )
          if (cleared === undefined || cleared === null || cleared.status !== 'saved' || cleared.snapshot === undefined) {
            done = true
            cleanup()
            return
          }
          const bound = await ctx.shortcuts.edit(
            { type: 'set', id: COMMAND_ID, binding: target },
            cleared.snapshot.revision,
          )
          if (bound === undefined || bound === null || bound.status !== 'saved') {
            // Do not leave the user without a search chord: undo the clear.
            try {
              const latest = ctx.shortcuts.config.getSnapshot()
              if (latest.status === 'ready') {
                await ctx.shortcuts.edit({ type: 'set', id: 'session.search', binding: target }, latest.revision)
              }
            } catch (_error) { /* best effort */ }
            done = true
            cleanup()
            return
          }
          mark()
          done = true
          cleanup()
        } catch (_error) {
          // Leave the marker unset so a later catalog/config frame can retry.
          done = true
          cleanup()
        } finally {
          running = false
        }
      }

      offConfig = ctx.shortcuts.config.subscribe(() => { void attempt() })
      offCatalog = ctx.shortcuts.catalog.subscribe(() => { void attempt() })
      void attempt()
      return cleanup
    }

    /** Required services; the loader waits for them before apply. */
    const inject = ['slots', 'locale', 'sessions', 'shortcuts', 'uiWorkspace']

    /**
     * Mount the locale, the command, the stylesheet and the two slot entries
     * (overlay + sidebar-foot trigger).
     * @param ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'telescope: dictionaries')

      const t = ctx.locale.bind(NS)
      const controller = createController()
      const api = {
        search: (query, signal) => ctx.sessions.search(query, signal),
        openSession: sessionId => { ctx.uiWorkspace.openSession(sessionId) },
      }

      ctx.effect(() => ctx.shortcuts.register({
        id: COMMAND_ID,
        label: () => t('command.label'),
        aliases: ['telescope', 'search sessions', 'find sessions'],
        defaults: COMMAND_DEFAULTS,
        regions: ['page', 'editable'],
        modals: ['telescope'],
        resolve: context => {
          const modal = context === undefined || context === null ? null : context.modal
          if (modal === 'telescope') {
            return { status: 'handled', run: () => { controller.close() } }
          }
          if (modal !== undefined && modal !== null) {
            return { status: 'blocked', reason: t('command.blocked') }
          }
          return { status: 'handled', run: () => { controller.open() } }
        },
      }), 'telescope: command')

      ctx.effect(() => installSearchShortcutTakeover(ctx), 'telescope: search shortcut takeover')

      ctx.effect(() => {
        const element = document.createElement('style')
        element.setAttribute('data-dsh-plugin', 'telescope-search')
        element.textContent = CSS
        document.head.appendChild(element)
        return () => { element.remove() }
      }, 'telescope: stylesheet')

      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'telescope-overlay',
        order: 40,
        locale: NS,
        inject: () => ({ controller, api, shortcutCatalog: ctx.shortcuts.catalog }),
      }, TelescopeOverlay)), 'telescope: overlay seat')

      ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'telescope-search',
        order: 0,
        locale: NS,
        inject: () => ({ controller, shortcutCatalog: ctx.shortcuts.catalog }),
      }, TelescopeTrigger)), 'telescope: sidebar trigger')
    }

    return { inject, apply }
  },
})
