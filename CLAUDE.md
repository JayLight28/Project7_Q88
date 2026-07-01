# Q88 Check — Claude Agent Reference (v1.2.0)

> **Primary reference for Claude. Reading this alone covers 80% of tasks.**

---

## 1. HARD RULES (Never Violate)

### Environment
- Single Windows box: Flask dev server (or waitress) run via `start_server.bat` on `PORT=5000`
- Vessel `.docx` files live in a shared/network watch folder (per-browser cookie `q88_folder`, default = folder containing `app_config.json`) — never assume a fixed local path
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
| `app.py` (~789L) | Flask routes, locks/cookies wiring, save/rename logic | routes at top, see table below |
| `q88/parser.py` (~294L) | Reads `.docx` tables/cells into structured field data | top |
| `q88/rules.py` (~75L) | Issue/warning rules (expiry, missing fields) | top |
| `q88/state.py` (~52L) | Edit-history cache + revert | top |
| `q88/style.py` (~148L) | Copies formatting from a reference `.docx` to targets | top |
| `q88/locks.py` (~50L) | In-memory per-file edit lock (180s timeout) | top |
| `q88/config.py` (~40L) | `app_config.json` read/write — watch folder | top |
| `static/app.js` (~264L) | Document editor page behavior | top |
| `static/home.js` (~202L) | File list / folder picker page | top |
| `templates/document.html` | Editor UI | — |
| `templates/index.html` | Home/file-list UI | — |
| `templates/history.html` | Per-file revert history UI | — |
| `templates/_panel.html` | Shared side-panel partial | — |

### app.py — Routes
| Route | Line | Purpose |
|-------|------|---------|
| `/` | 203 | Home — list files in current folder |
| `/pick_folder` | 225 | Native folder picker (tkinter dialog) |
| `/import_file` | 242 | Import a `.docx` into the watch folder |
| `/set_name` | 264 | Set display name cookie |
| `/open/<filename>` | 272 | Parse + cache a doc, render editor |
| `/heartbeat/<filename>` | 377 | Keep-alive to refresh edit lock |
| `/lock_status/<filename>` | 385 | Poll current lock holder |
| `/release/<filename>` | 392 | Release edit lock |
| `/panel/<filename>` | 399 | Re-render side panel (issues/status) |
| `/field_edit/<filename>/<field_id>` | 417 | Single-field inline edit |
| `/history/<filename>` | 445 | Edit history view |
| `/history/<filename>/revert/<index>` | 464 | Revert to a prior value |
| `/restore_original/<filename>` | 500 | Restore from original reference form |
| `/save/<filename>` | 615 | Write edits to `.docx`, may rename by date |
| `/save_as/<filename>` | 642 | Copy current in-browser edits to a new `.docx`, original untouched |
| `/add_row/<filename>/<table_key>` | 673 | Append a table row |
| `/delete_row/<filename>/<table_key>/<row_index>` | 696 | Remove a table row |
| `/apply_style_all` | 733 | Copy style from reference file to all docs |

### app.py — Key Helpers
| Function | Line | Purpose |
|----------|------|---------|
| `get_client_id` / `get_display_name` / `get_current_folder` | 49/59/63 | Per-browser cookie identity |
| `_safe_path` | 85 | Containment check — every `<path:filename>` route must resolve through this before touching disk |
| `_compute_issues` | 126 | Expiry/warning scan for side panel; multi-column table rows collapse to one issue |
| `_get_or_load_cache` | 531 | `_OPEN_CACHE` lookup keyed by `folder::filename`, guarded by `_cache_mutex` |
| `_apply_form_edits` | 541 | Bulk-apply submitted form fields |
| `_maybe_rename_by_date_field` / `_rename_for_date` | 597/573 | Auto-rename `Q88 V6 <code> <date>.docx` when date field changes |
| `_apply_style_to_file` | 719 | Per-file style copy used by `/apply_style_all` |

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

Only create a plan doc for multi-step or cross-file changes — trivial fixes don't need one. Given the size of this app (~2200 lines total), no `docs_canonical/` suite is needed — the line map in Section 3 above is the single source of truth; re-scan it on `/dock` instead of maintaining a separate REPO_MAP.md.
