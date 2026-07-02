# Date Normalization + Tiered Expiry Warnings - Design

Date: 2026-07-02

## Problem

1. Users type dates into Q88 fields in whatever format they're used to (2026/07/02, 02.07.2026, 2 Jul 2026, ...), so the same document has inconsistent date formatting. Need every date field normalized to **dd-mmm-yyyy** and input via a calendar picker instead of free text.
2. Expiry detection currently uses a single user-configurable `warning_days` threshold (default 60). Need three fixed tiers - 30/60/90 days - and files with expired or soon-expiring (<=30d) items must be visually obvious on the home page without opening them.

## Scope

Touches `q88/rules.py`, `app.py`, `templates/document.html`, `templates/index.html`, `templates/_panel.html`, `static/app.js`, `static/style.css`. No new dependencies (no CDN/build step - shared network folder, must work offline).

## 1. Date field detection & normalization

- **Detection is content-based**: a cell is a "date field" if its current text parses via `rules.try_parse_date()`. No label/keyword allowlist to maintain. Known limitation: an empty date field can't be detected until it has a value once (first entry must be typed as plain text; after that it round-trips as a date field).
- **Normalization timing**: on `/open`, every field whose text parses as a date gets its display text rewritten to dd-mmm-yyyy before being placed into the form's `value`. This is purely a display-time rewrite of the in-memory row dict - nothing is written to disk on open. If the user hits Save without touching that field, the normal save path (`_apply_form_edits`) sees the reformatted text differs from the on-disk text and writes/records it like any other edit (shows up in edit history, as expected).
- **Locale-safety**: `strftime("%b")` depends on OS locale (Windows box may be set to Korean), which would silently produce non-English month abbreviations. `rules.py` gets a hardcoded `MONTH_ABBR = ["Jan", "Feb", ..., "Dec"]` list and a `format_date(d) -> "02-Jul-2026"` helper that never touches `strftime` for the month name.

## 2. Calendar picker

- Native `<input type="date">` - no external library, works offline, built into every modern browser.
- Only fields detected as date fields (per above) render as `type="date"` with `value` set to ISO `yyyy-mm-dd` (`row.date_iso` / `c.date_iso`); everything else stays `type="text"` exactly as today.
- Browsers show their own locale's picker/format while editing; this is fine because the *stored* value (what's written to the .docx) is always normalized to dd-mmm-yyyy server-side regardless of what the browser displays during editing.
- On submit, native date inputs send ISO `yyyy-mm-dd`. Server-side, `_apply_form_edits` and `/field_edit` convert any submitted value matching ISO format (`datetime.date.fromisoformat`, wrapped in try/except ValueError) to dd-mmm-yyyy via `rules.format_date` before comparing against `old_text` and writing. Empty string (cleared date) passes through unchanged so the field becomes MISSING as expected.
- `static/app.js`: add `input[type="date"]` to the dirty-tracking selector (currently only tracks `input[type="text"], input[type="checkbox"]`).

## 3. Tiered expiry warnings (30/60/90 days)

- `q88/rules.py`:
  - Remove the `warning_days` parameter from `classify()`. Internally use a fixed 90-day max window.
  - `classify()` returns one of: `OK`, `MISSING`, `NOT_APPLICABLE`, `HISTORICAL`, `EXPIRED`, `DUE_30`, `DUE_60`, `DUE_90` (delta < 0 -> EXPIRED; <=30 -> DUE_30; <=60 -> DUE_60; <=90 -> DUE_90; else OK). This replaces the old single `WARNING` state.
  - `HIGHLIGHTABLE = {MISSING, EXPIRED, DUE_30, DUE_60, DUE_90}`.
- `app.py`:
  - Drop `DEFAULT_WARNING_DAYS` constant and the `warning_days` query/form parameter from every route and redirect that currently threads it through (`/open`, `/save`, `/save_as`, `/add_row`, `/delete_row`, `/panel`, `_compute_issues` signature).
  - `state_order` dicts used for sorting issues get the new tier keys: `{"EXPIRED": 0, "DUE_30": 1, "DUE_60": 2, "DUE_90": 3, "MISSING": 4}`.
- `templates/document.html`: remove the "Warn within (days)" number input + Apply button + hidden `warning_days` field. Update the legend to show all four tiers (Expired / Due <=30d / Due <=60d / Due <=90d / Missing) plus "Recently changed". Row/cell classes become `state-{{ row.display_state }}` with the new tier values (template already does this generically, no structural change needed beyond CSS).
- `static/app.js`: remove the warning-days view/hidden-input/apply-button wiring block entirely.
- `static/style.css`: add `--due30` (dark orange, e.g. `#e67e22`) and `--due90` (light yellow, e.g. `#f7dc6f`) variables; reuse existing `--warn` for `DUE_60`. Add `.state-DUE_30`, `.state-DUE_60`, `.state-DUE_90` rules mirroring the existing `.state-WARNING`/`.state-EXPIRED` pattern (row background, swatch, issue-row border) in both the main table, sub-table, and issues panel.

Warnings stay in English (not translated), matching the rest of the UI.

## 4. Home page highlighting

- `_quick_scan` (app.py) computes, alongside `issue_count`: `worst_state` (the single most severe tier present among that file's issues, or `None`) and `worst_count` (how many issues share that worst tier). Cached the same way as today (keyed by path+mtime).
- `index()` route passes `worst_state`/`worst_count` through to each file dict.
- `templates/index.html`:
  - File card (`.file-card`) gets a `data-severity="{{ f.worst_state }}"` attribute (or conditional class) driving a colored left border/background via CSS, matching the same tier colors as the document page.
  - The existing "N issues" badge becomes tier-specific text when `worst_state` is set, e.g. "2 expired", "1 due <=30d", "3 due <=60d", "1 due <=90d" - falls back to today's generic "N issues" / "No issues" wording when there's no date-driven tier (e.g. only MISSING issues).
  - A summary banner above the file list aggregates counts across all files by tier (e.g. "2 file(s) expired, 1 file(s) due within 30 days") and is hidden entirely when no file has an EXPIRED/DUE_30/DUE_60/DUE_90 item.
- `static/style.css`: new `.file-card[data-severity=...]` border/background rules using the same `--due30`/`--warn`/`--due90`/`--expired` variables as the document page, plus a small `.severity-banner` style.

## Out of scope

- No change to `HISTORICAL` or `NOT_APPLICABLE` classification logic.
- No label/keyword-based date detection (content-based only, per decision above).
- No i18n of warning text.
