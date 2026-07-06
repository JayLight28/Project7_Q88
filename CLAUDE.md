# Q88 Check — Claude Agent Reference (v1.5.1)

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
| `app.py` (~1044L) | Flask routes, locks/cookies wiring, save/rename logic | routes at top, see table below |
| `q88/parser.py` (~294L) | Reads `.docx` tables/cells into structured field data | top |
| `q88/rules.py` (~128L) | Issue/warning rules (expiry tiers, missing fields), date formatting (`format_date`, `normalize_incoming_date`, `try_parse_pure_date`) | top |
| `q88/state.py` (~52L) | Edit-history cache + revert | top |
| `q88/style.py` (~148L) | Copies formatting from a reference `.docx` to targets | top |
| `q88/locks.py` (~50L) | In-memory per-file edit lock (180s timeout) | top |
| `q88/config.py` (~53L) | `app_config.json` read/write — watch folder + named fleet folder presets | top |
| `static/app.js` (~248L) | Document editor page behavior | top |
| `static/home.js` (~382L) | File list / folder picker page + first-run tutorial tour (`q88_tutorial_done` localStorage flag, `#tour-btn` replay) | top |
| `templates/document.html` | Editor UI | — |
| `templates/index.html` | Home/file-list UI | — |
| `templates/history.html` | Per-file revert history UI | — |
| `templates/_panel.html` | Shared side-panel partial | — |
| `tests/test_rules.py` (~95L) | Unit tests for `q88/rules.py` pure functions (`python -m pytest tests/`, needs `requirements-dev.txt`) | top |

### app.py — Routes
| Route | Line | Purpose |
|-------|------|---------|
| `/` | 301 | Home — list files in current folder, fleet quick-picks, severity banner |
| `/pick_folder` | 360 | Switch watch folder (typed path, must resolve under a fleet root — see `_is_allowed_folder`) |
| `/import_file` | 381 | Import a `.docx` into the watch folder (browser upload; falls back to server-side tkinter dialog) |
| `/rename_file/<filename>` | 419 | Rename a file from the home page |
| `/set_name` | 448 | Set display name cookie |
| `/open/<filename>` | 456 | Parse + cache a doc, render editor |
| `/heartbeat/<filename>` | 562 | Keep-alive to refresh edit lock |
| `/lock_status/<filename>` | 570 | Poll current lock holder |
| `/release/<filename>` | 577 | Release edit lock |
| `/panel/<filename>` | 584 | Re-render side panel (issues/status) |
| `/field_edit/<filename>/<field_id>` | 606 | Single-field inline edit; requires `locks.is_owner()` |
| `/history/<filename>` | 640 | Edit history view |
| `/history/<filename>/revert/<index>` | 659 | Revert to a prior value |
| `/restore_original/<filename>` | 695 | Restore from original reference form |
| `/save/<filename>` | 849 | Write edits to `.docx` (archives pre-edit copy to `Obsolete/` first), may rename by date |
| `/save_as/<filename>` | 879 | Copy current in-browser edits to a new `.docx`, original untouched |
| `/add_row/<filename>/<table_key>` | 909 | Append a table row |
| `/delete_row/<filename>/<table_key>/<row_index>` | 938 | Remove a table row |
| `/apply_style_all` | 977 | Copy style from reference file to all docs |

### app.py — Key Helpers
| Function | Line | Purpose |
|----------|------|---------|
| `get_client_id` / `get_display_name` / `get_current_folder` | 62/72/76 | Per-browser cookie identity |
| `_safe_path` | 98 | Containment check — every `<path:filename>` route must resolve through this before touching disk |
| `TIER_ORDER` (constant) | 24 | `{"EXPIRED":0,"DUE_30":1,"DUE_60":2,"DUE_90":3,"MISSING":4}` — single source of severity ranking, shared by `_compute_issues`, `_severity_summary`, `open_file` |
| `_compute_issues` | 153 | Expiry/warning scan for side panel; multi-column table rows collapse to one issue; attaches `is_date`/`date_iso` per issue |
| `_severity_summary` | 214 | Returns `(worst_state, worst_count, missing_count)` — MISSING is tracked separately from the expiry tiers so it's never hidden behind a worse tier on the same file (home-page cards show both badges) |
| `_is_allowed_folder` | 341 | `/pick_folder` guard — rejects any path not under a configured fleet root (`q88/config.get_fleets`) |
| `_get_or_load_cache` | 726 | `_OPEN_CACHE` lookup keyed by `folder::filename`, guarded by `_cache_mutex` |
| `_apply_form_edits` | 736 | Bulk-apply submitted form fields; runs date-input values through `rules.normalize_incoming_date` |
| `_rename_for_date` | 768 | Renames on disk + moves state/backup sidecars |
| `_archive_previous_version` | 815 | Copies the pre-edit file into `Obsolete/` before `/save` overwrites it |
| `_maybe_rename_by_date_field` | 831 | Auto-rename `Q88 V6 <code> <date>.docx` when date field changes |
| `_apply_style_to_file` | 963 | Per-file style copy used by `/apply_style_all` |

`open_document` (124) reuses the cached parse instead of re-reading the file from disk when its stored `mtime` still matches — add_row/delete_row, `/field_edit` and `/save` all refresh that mtime after writing (the in-memory doc they just saved IS the on-disk version), and `/panel` reads through this cache too, so neither the post-save redirect nor a home-page quick-edit's panel refresh forces a full network read+parse.

**Date fields:** a cell is treated as a date field only if its *entire* stripped text is a date (`rules.try_parse_pure_date`, anchored regex) — not just a date embedded in a longer sentence or a compound "date / place" cell. Detected date fields render as native `<input type="date">` (document page) or switch the home-page quick-edit modal to `type="date"`; both paths normalize to dd-mmm-yyyy via `rules.normalize_incoming_date` on save. Expiry severity is fixed at 30/60/90-day tiers (`rules.classify`, no more configurable `warning_days`).

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
