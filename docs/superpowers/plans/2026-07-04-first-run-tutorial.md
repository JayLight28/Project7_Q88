# First-Run Tutorial + Replay Button

**Goal:** On a browser's first visit to the home page, auto-start a guided tour that
(1) prompts the user to set their display name and (2) walks through the main features.
A `?` button in the top-right of the home page header replays the tour anytime.

**Scope:** Home page only. No backend changes.

## Design decisions

- **First-run detection:** `localStorage["q88_tutorial_done"]` (per browser/machine,
  matches the `q88_` cookie prefix convention). Absent -> tour auto-starts on load.
  Set on finish *and* on skip so it never nags twice.
- **Tour engine:** vanilla JS spotlight tour inside `static/home.js` (same
  DOMContentLoaded handler - one JS file per page convention). One fixed-position
  spotlight div with a giant box-shadow dims the page around the target; a tooltip
  box shows title/body/step-count/Back/Next/Skip. `pointer-events: none` on the
  spotlight so the highlighted element stays interactive (user can type their name
  mid-tour). Escape key exits.
- **Name inducement:** step 2 targets the "You:" name field, auto-focuses the input,
  and prepends a warning line when the current name is empty/"Anonymous".
- **Steps** (steps whose target selector matches nothing are skipped, e.g. style-sync
  when no reference file exists):
  1. Welcome (centered, no target)
  2. `.toolbar-name` - set your display name (auto-focus input)
  3. `.toolbar-panel .toolbar-row` - watch folder, fleet quick-picks, import
  4. `.doc-pane` - file list, severity badges, click/double-click behavior
  5. `#detail-pane` - issues + history side panel, inline fixes
  6. `.toolbar-sync` - style sync (conditional)
  7. `#tour-btn` - replay hint
- **Replay button:** `<button id="tour-btn" class="app-bar-help">?</button>` appended
  to `.app-bar`, pushed right via `margin-left: auto`.

## Tasks

- [x] `templates/index.html`: add `#tour-btn` help button to the app-bar
- [x] `static/style.css`: `.app-bar-help`, `.tour-spotlight`, `.tour-tip` styles
  (z-index 400+, above `.modal-overlay` at 300)
- [x] `static/home.js`: tour steps, spotlight/tooltip engine, auto-start on first
  run, `#tour-btn` click handler, resize repositioning, Escape to exit
- [x] Verify: JS syntax check + render home page via Flask test client
