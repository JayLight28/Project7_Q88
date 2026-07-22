# Q88 Check — Claude Agent Reference (v1.6.0)

> **Primary reference for Claude. Reading this alone covers 80% of tasks.**

---

## 1. HARD RULES (Never Violate)

### Environment
- Single Windows box: Flask dev server (or waitress) run via `start_server.bat` on `PORT=5000`
- Vessel `.docx` files live in a shared/network watch folder (per-browser cookie `q88_folder`, default = folder containing `app_config.json`) — never assume a fixed local path
- Watch folder must resolve under one of the fleet roots in `q88/config.get_fleets()` (currently "Fortune Fleet" / "Local Fleet" on `\\192.168.168.250\marine\Q88 for all Ships\`) — `/pick_folder` rejects anything else via `_is_allowed_folder`
- `q88/__pycache__` is generated — never hand-edit `.pyc`

### Code
- No inline date math → keep in `app.py` near `FILENAME_RE`/`_maybe_rename_by_date_field` (no separate date util module yet — don't scatter parsing)
- No inline `docx` cell access outside `q88/parser.py` — all `python-docx` table/cell logic belongs there
- No bare `except:` in Python → `except Exception:`
- Style rules (fonts, borders, shading) belong in `q88/style.py`, not inline in `app.py`
- Per-file edit locks (`q88/locks.py`) must be respected before mutating a doc: check `is_owner`/`acquire` before write handlers
- Field/table diff + revert history goes through `q88/state.py` — don't bypass it with direct file writes

### Communication
- Korean for conversation, English for code/docs
- No unnecessary apologies — direct, technical, minimal
- Minimal diff — targeted snippets, not full file overwrites
- Git = Commit + Push — `git push` immediately after `git commit` (once this project has a remote)

### Output Behavior (Token Efficiency)
- No sycophantic openers — answer is always line 1. Never "Sure!", "Great question!", "Absolutely!"
- No hollow closings — never "I hope this helps! Let me know if you need anything!"
- No prompt restatement — execute immediately, do not repeat back what was asked
- ASCII-only output — no em dashes, smart quotes, or Unicode characters that break parsers
- No "As an AI..." framing — ever
- No unsolicited suggestions — exact scope only, nothing beyond what was asked
- No unnecessary disclaimers — omit unless there is a genuine safety risk
- Simplest working solution — no abstractions or over-engineering that was not requested
- Uncertain facts → say "I don't know" — never guess or hallucinate
- User correction becomes session ground truth — never push back with "You're absolutely right but..."
- Never read the same file twice in one session
- Never touch code outside the explicit scope of the request

---

## 2. PROJECT OVERVIEW

**Q88 Check** — Multi-user web editor for Q88 V6 vessel questionnaire `.docx` files (oil/chemical tanker particulars).
**Stack:** Flask (Python) · python-docx · vanilla JS/HTML/CSS (no build step) · waitress (prod server)

**Core flows:** browse folder → open a vessel `.docx` → edit fields/tables in-browser (locked per file) → save back to `.docx` (auto-renames by date) → per-field edit history with revert → "apply style to all" to sync formatting from a reference file.

---

## 3. KEY FILES & LINE MAP

| File | Purpose | Entry Point |
|------|---------|-------------|
| `app.py` (~1208L) | Flask routes, locks/cookies wiring, save/rename logic, stale-name resolution, Obsolete/ retention | routes at top, see table below |
| `q88/parser.py` (~294L) | Reads `.docx` tables/cells into structured field data | top |
| `q88/rules.py` (~138L) | Issue/warning rules (expiry tiers, missing fields), date formatting (`format_date`, `normalize_incoming_date`, `normalize_newlines`, `try_parse_pure_date`; `try_parse_date` is `dayfirst=True`) | top |
| `q88/state.py` (~65L) | Edit-history cache + revert; `move_sidecars` for renames (dir creation only in `save_state`/`ensure_backup`, never on reads) | top |
| `q88/style.py` (~148L) | Copies formatting from a reference `.docx` to targets | top |
| `q88/locks.py` (~55L) | In-memory per-file edit lock (180s timeout); `acquire` returns `(ok, holder, resumed)` — `resumed` = not a plain refresh of the caller's live lock | top |
| `q88/config.py` (~53L) | `app_config.json` read/write — watch folder + named fleet folder presets | top |
| `static/app.js` (~421L) | Document editor page behavior; AJAX save sends `X-Q88-Ajax` so a lost-lock save gets a 409 (keeps typed input) instead of following a redirect; plain Save shows a diff-confirm modal (changed fields old→new) first; heartbeat clears its previous interval on re-init (`window._q88HeartbeatTimer`) and shows a dismissible banner on lost lock / lapsed-and-resumed lock | top |
| `static/home.js` (~448L) | File list / folder picker page + first-run tutorial tour (`q88_tutorial_done` localStorage flag, `#tour-btn` replay); quick-edit modal uses a `<textarea>` for multiline values; search matches filename + vessel name, combined with severity chip filter (`data-severity`/`data-missing`) | top |
| `templates/document.html` | Editor UI | — |
| `templates/index.html` | Home/file-list UI | — |
| `templates/history.html` | Per-file revert history UI | — |
| `templates/_panel.html` | Shared side-panel partial | — |
| `tests/test_rules.py` (~95L) | Unit tests for `q88/rules.py` pure functions (`python -m pytest tests/`, needs `requirements-dev.txt`) | top |
| `tests/test_locks.py` (~80L) | Lock acquire/refresh/expire/resume/release semantics | top |
| `tests/test_app.py` (~180L) | Route tests: Flask test client + tmp watch folder via `q88_folder` cookie, generated 3-column docx fixture (field ids f1..f4); covers open/save/date-rename/409 conflict/field_edit/heartbeat-resumed/prune | top |

### app.py — Routes
| Route | Line | Purpose |
|-------|------|---------|
| `/` | 366 | Home — list files in current folder, fleet quick-picks, severity banner |
| `/pick_folder` | 425 | Switch watch folder (typed path, must resolve under a fleet root — see `_is_allowed_folder`) |
| `/import_file` | 446 | Import a `.docx` into the watch folder (browser upload; falls back to server-side tkinter dialog) |
| `/rename_file/<filename>` | 484 | Rename a file from the home page |
| `/set_name` | 514 | Set display name cookie |
| `/open/<filename>` | 522 | Resolve stale name (redirect), parse + cache a doc, render editor |
| `/heartbeat/<filename>` | 633 | Keep-alive to refresh edit lock (does NOT resolve stale names — see `release_lock`) |
| `/lock_status/<filename>` | 645 | Poll current lock holder |
| `/release/<filename>` | 653 | Release edit lock (does NOT resolve stale names, so a dead tab can't drop the live lock) |
| `/panel/<filename>` | 664 | Re-render side panel (issues/status) |
| `/field_edit/<filename>/<field_id>` | 687 | Single-field inline edit; requires `locks.is_owner()` |
| `/history/<filename>` | 727 | Edit history view (uses `_safe_path` for containment) |
| `/history/<filename>/revert/<index>` | 758 | Revert to a prior value |
| `/restore_original/<filename>` | 795 | Restore from original reference form |
| `/save/<filename>` | 1007 | Write edits to `.docx` (archives pre-edit copy to `Obsolete/` first, then prunes >12-month archives), may rename by date; lost lock -> `_lock_conflict_response` |
| `/save_as/<filename>` | 1041 | Copy current in-browser edits to a new `.docx`, original untouched |
| `/add_row/<filename>/<table_key>` | 1072 | Append a table row |
| `/delete_row/<filename>/<table_key>/<row_index>` | 1102 | Remove a table row |
| `/apply_style_all` | 1142 | Copy style from reference file to all docs |

### app.py — Key Helpers
| Function | Line | Purpose |
|----------|------|---------|
| `get_client_id` / `get_display_name` / `get_current_folder` | 62/72/76 | Per-browser cookie identity |
| `_safe_path` | 98 | Containment check — every `<path:filename>` route must resolve through this before touching disk |
| `TIER_ORDER` (constant) | 24 | `{"EXPIRED":0,"DUE_30":1,"DUE_60":2,"DUE_90":3,"MISSING":4}` — single source of severity ranking, shared by `_compute_issues`, `_severity_summary`, `open_file` |
| `_resolve_filename` | 117 | Maps a stale (renamed-away) filename to the current file by ship code, so pages opened before a date-rename keep working; hint/negative caches (`_RENAME_HINTS`/`_RESOLVE_MISSES`) avoid an `os.listdir` per poll. Applied on read/write routes but NOT heartbeat/release |
| `open_document` | 167 | Parses under `_cache_mutex` fast-path, then re-parses OUTSIDE the lock and only installs if not older than a concurrently-cached version (mtime guard) |
| `_compute_issues` | 209 | Expiry/warning scan for side panel; multi-column table rows collapse to one issue; carries the worst cell's real text + `is_date`/`date_iso` per issue |
| `_severity_summary` | 272 | Returns `(worst_state, worst_count, missing_count)` — MISSING is tracked separately from the expiry tiers so it's never hidden behind a worse tier on the same file (home-page cards show both badges) |
| `_quick_scan` | 290 | Home-card scan; cache key is `(path, docx_mtime, state_mtime)` so an N/A-mute (state-only change) refreshes the badge |
| `_is_allowed_folder` | 405 | `/pick_folder` guard — rejects any path not under a configured fleet root (`q88/config.get_fleets`) |
| `_lock_conflict_response` | 747 | Lost-lock reply: 409 JSON for an `X-Q88-Ajax` save (page/input preserved), redirect otherwise |
| `_get_or_load_cache` | 826 | Revalidates via `open_document`; returns the cache entry with an eviction-race fallback (no bare `[key]`) |
| `_apply_form_edits` | 852 | Bulk-apply submitted form fields; normalizes CRLF (`rules.normalize_newlines`) + date inputs (`rules.normalize_incoming_date`) |
| `_rename_for_date` | 884 | Renames on disk + `statemod.move_sidecars` + records a `_RENAME_HINTS` entry |
| `_prune_obsolete` | 932 | 12-month retention for `Obsolete/` (`OBSOLETE_RETENTION_DAYS=365`); age = archive mtime (copy2 preserves it = the version's last-save time); always keeps the newest archive per ship code; stamped non-`FILENAME_RE` names group by stripped base name |
| `_archive_previous_version` | 971 | Copies the pre-edit file into `Obsolete/` before `/save` overwrites it, then runs `_prune_obsolete` |
| `_maybe_rename_by_date_field` | 988 | Auto-rename `Q88 V6 <code> <date>.docx` when date field changes |
| `_apply_style_to_file` | 1127 | Per-file style copy used by `/apply_style_all` |

`open_document` (167) reuses the cached parse instead of re-reading the file from disk when its stored `mtime` still matches — add_row/delete_row, `/field_edit` and `/save` all refresh that mtime after writing (the in-memory doc they just saved IS the on-disk version), and `/panel` reads through this cache too, so neither the post-save redirect nor a home-page quick-edit's panel refresh forces a full network read+parse. The docx parse itself runs OUTSIDE `_cache_mutex` (a 0.5-1s network read must not serialize every other request); the mutex only guards the dict, and a slower stale read can't clobber a fresher cached version (mtime guard).

**Date fields:** a cell is treated as a date field only if its *entire* stripped text is a date (`rules.try_parse_pure_date`, anchored regex) — not just a date embedded in a longer sentence or a compound "date / place" cell. Detected date fields render as native `<input type="date">` (document page) or switch the home-page quick-edit modal to `type="date"`; both paths normalize to dd-mmm-yyyy via `rules.normalize_incoming_date` on save. Numeric-date parsing is day-first (`try_parse_date(dayfirst=True)`) to match fleet convention (e.g. `12-06-2025` = 12 Jun). Multiline cells (addresses, crew lists) render as `<textarea>` (document page and home modal) and CRLF is normalized to `\n` on every write via `rules.normalize_newlines`. Expiry severity is fixed at 30/60/90-day tiers (`rules.classify`, no more configurable `warning_days`).

---

## 4. CODING PATTERNS (Quick Ref)

### Python / Flask
- Routes are thin — parsing/state/style logic stays in `q88/*`
- Filenames always match `FILENAME_RE`: `Q88 V6 <ship code> <date>.docx`
- All doc mutation must go through the client's edit lock check first
- Cache key convention: `f"{folder}::{filename}"` (see `_key`) — always folder-scoped, never bare filename

### Naming
| Thing | Convention | Example |
|-------|-----------|---------|
| Routes | snake_case, REST-ish path | `/field_edit/<filename>/<field_id>` |
| Python functions | snake_case | `_maybe_rename_by_date_field` |
| Cookies | `q88_` prefix | `q88_client_id`, `q88_folder` |
| JS files | one per page | `home.js`, `app.js` |

---

## 5. DATA FLOW

```
Browser (vanilla JS) ──REST──▶ Flask (app.py) ──▶ q88/parser.py ──▶ .docx (watch folder)
                                          └──▶ q88/state.py (history cache, in-memory)
                                          └──▶ q88/locks.py (in-memory per-file lock)
```
- **Read:** `/open/<filename>` → parse `.docx` → cache in `_OPEN_CACHE` → render `document.html`
- **Write:** field edit → `/field_edit` (live) and/or `/save` (persist to `.docx`, may trigger rename)
- **Concurrency:** first browser to `/open` a file acquires the lock (`q88/locks.py`); others are blocked until release or 180s timeout
- **History:** every applied edit recorded via `q88/state.py`; `/history/<filename>/revert/<index>` restores a prior value

---

## 6. SESSION COMMANDS

### `/dock` — End of session
1. **Version bump**: `APP_VERSION` in `app.py` → propagate to this file's header
2. **git commit + push** (once a remote exists)

### `/survey` — Full code inspection
1. Python syntax/import check (`python -m py_compile app.py q88/*.py`)
2. Route ↔ handler ↔ template cross-check (`static/app.js`/`home.js` fetch calls vs `app.py` routes)
3. Hard Rule violations: bare `except:`, inline docx cell access outside `q88/parser.py`, direct file writes bypassing locks/state
4. Report: Critical / Warning / Info

---

## 7. SUPERPOWERS WORKFLOW

For planning/implementing non-trivial changes, use the `superpowers` skill set (`superpowers@superpowers-dev` v6.1.0, installed user-scope — active in new sessions):
- `docs/superpowers/plans/` — dated implementation plans (`YYYY-MM-DD-<slug>.md`), task-by-task checkboxes, followed via `superpowers:executing-plans`

Only create a plan doc for multi-step or cross-file changes — trivial fixes don't need one. Given the size of this app (~2480 lines total including tests), no `docs_canonical/` suite is needed — the line map in Section 3 above is the single source of truth; re-scan it on `/dock` instead of maintaining a separate REPO_MAP.md.
