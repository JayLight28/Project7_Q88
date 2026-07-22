# v1.6.0 improvements (approved scope)

Approved by user 2026-07-22. Item 1 (fleet-wide expiry report) was cancelled -
a separate fleet management program already covers it.

## Tasks

- [x] 1. Obsolete/ retention - delete archived versions older than 12 months
  - `app.py`: new `_prune_obsolete(obsolete_dir)` called from
    `_archive_previous_version` after each archive copy.
  - Age = archive file mtime (copy2 preserves it = when that version was
    last saved, i.e. the version's creation time).
  - Safety: always keep the newest archive per ship code (FILENAME_RE group 2),
    regardless of age.
  - Constant `OBSOLETE_RETENTION_DAYS = 365`.

- [x] 2. Home page: severity filter + vessel-name search
  - `templates/index.html`: add `data-vessel` and `data-missing` attrs to
    cards; add filter chip row (All / Expired / <=30d / <=60d / <=90d / Empty).
  - `static/home.js`: `applyFilter` combines text query (filename + vessel
    name) AND severity chip. MISSING chip matches `data-missing="1"`
    (missing can coexist with a worse tier).

- [x] 3. Save confirmation with change summary (document page)
  - `static/app.js`: intercept only the plain Save submit (no formaction);
    collect changed `f_*` inputs/textareas (value vs defaultValue) and `na_*`
    checkboxes (checked vs defaultChecked); label from the row's item-code +
    label td, or sub-table title + first cell for table cells.
  - No changes -> save immediately (rename-by-date still applies).
  - Reuse `.modal-overlay`/`.modal-box` (global CSS). New `.diff-*` styles
    in `style.css`. Save As / add-row / delete-row are NOT intercepted.

- [x] 4. Lock lapse notice (document page)
  - `q88/locks.py`: `acquire` returns `(ok, holder, resumed)` - `resumed`
    True when the lock was not a continuous refresh of the caller's own
    live lock (entry absent, expired, or taken over from an expired holder).
  - `app.py`: heartbeat returns `resumed`; open_file ignores it.
  - `static/app.js`: heartbeat handler shows a dismissible banner:
    lost lock (`ok=false`) -> holder name + "saving disabled";
    `resumed=true` -> "lock lapsed >3min, refresh before saving if others
    may have edited". No duplicate banners.

- [x] 5. Test expansion
  - `tests/test_locks.py`: acquire/refresh/expire/resume/release semantics.
  - `tests/test_app.py`: Flask test client + tmp watch folder (cookie), tiny
    generated 3-column docx (field rows only - no section row, so parser
    yields plain fields):
    - /open renders and acquires lock
    - /save writes cell text, archives to Obsolete/, records history sidecar
    - /save renames when item 1.1 date changes (FILENAME_RE date sync)
    - lost-lock /save with X-Q88-Ajax -> 409
    - /field_edit updates a single cell
    - _prune_obsolete keeps newest per ship code, deletes >365d
  - Reset `locks._locks` between tests; unique tmp folder per test isolates
    the module-level caches.

- [x] 6. Verify: `python -m pytest tests/`, `python -m py_compile app.py q88/*.py`
- [x] 7. Codex second-pass review of the full diff

