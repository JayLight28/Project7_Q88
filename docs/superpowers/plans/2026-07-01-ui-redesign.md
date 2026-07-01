# Q88 Check UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Q88 Check's visual layer to a minimal flat style (navy-token based, modeled on the OCIMF Particulars Editor reference screenshots) and improve four specific UX flows, with zero changes to Flask routes, `q88/*.py` logic, or data structures.

**Architecture:** Pure front-end change. `static/style.css` is rewritten around a small set of CSS custom properties (design tokens). `templates/*.html` get markup/class adjustments only (Jinja logic untouched). `static/app.js` and `static/home.js` get interaction-layer edits (toast removal in favor of inline status text, search/sort for the file list, issue-panel transition polish). No new routes, no new persisted fields.

**Tech Stack:** Vanilla CSS/JS, Jinja2 templates, Flask dev server (`start_server.bat`, port 5000). No build step, no test framework — verification is manual (start server, `curl` pages, grep for expected markup).

## Global Constraints

- No changes to `app.py` routes/handlers, `q88/*.py` logic, or `q88/state.py` history format (spec: Scope).
- No new persisted fields, no schema changes, no dark mode, no bundler/framework introduction (spec: Non-goals).
- Keep the navy color family (`#14507e`/`#1a5276`), do not introduce a new hue as the primary accent (spec: Color & Typography).
- Bare `except:` is forbidden project-wide — do not introduce one; Task 3 makes one small additive change to `app.py`'s `list_files()`.
- After the Task 3 Python edit: `python -m py_compile app.py`.

---

### Task 1: Design tokens + full `static/style.css` rewrite

**Files:**
- Modify: `static/style.css` (full rewrite, all ~453 lines)

**Interfaces:**
- Consumes: nothing (pure CSS)
- Produces: CSS custom properties (`--navy`, `--navy-dark`, `--bg`, `--bg-chrome`, `--border`, `--text`, `--text-muted`, `--danger`, `--danger-bg`, `--warn`, `--warn-bg`, `--expired`, `--expired-bg`, `--missing`, `--missing-bg`, `--recent`, `--radius`) that Tasks 2 and 3's template edits may reference by class name (not by touching the CSS file itself — those tasks only add classes already defined here: `.save-status`, `.save-status.error`, `.banner-icon`, `.file-search`, `.file-sort`). Class names used by existing templates (`.sidebar`, `.toolbar`, `.row-field.state-*`, `.file-card`, `.notice`, `.issues-panel`, etc.) keep the same names so no template markup breaks before Tasks 2/3 land.

- [ ] **Step 1: Write the new stylesheet**

Replace the entire contents of `static/style.css` with:

```css
:root {
  --navy: #1a5276;
  --navy-dark: #123a54;
  --bg: #ffffff;
  --bg-chrome: #f7f8fa;
  --border: #e5e8ec;
  --text: #2c3e50;
  --text-muted: #7c8ba1;
  --danger: #c0392b;
  --danger-bg: #fbe4e4;
  --warn: #f1c40f;
  --warn-bg: #fdf8ec;
  --expired: #e74c3c;
  --expired-bg: #fdf1f1;
  --missing: #9b8fd1;
  --missing-bg: #f5f2fb;
  --recent: #f7d000;
  --radius: 6px;
}

body {
  font-family: "Segoe UI", system-ui, Calibri, sans-serif;
  font-size: 13px;
  margin: 0;
  background: var(--bg-chrome);
  color: var(--text);
}

.app-shell { display: flex; align-items: flex-start; }

.sidebar {
  width: 240px;
  flex: 0 0 240px;
  height: 100vh;
  position: sticky;
  top: 0;
  overflow-y: auto;
  background: var(--bg-chrome);
  color: var(--text);
  border-right: 1px solid var(--border);
  box-sizing: border-box;
}
.sidebar-actions { display: flex; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.sidebar-actions .small-btn { background: var(--bg); }
.sidebar-nav { display: flex; flex-direction: column; padding: 4px 0 20px; }
.sidebar-nav a {
  color: var(--text-muted);
  text-decoration: none;
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 4px;
  margin: 1px 8px;
  transition: background 0.12s ease;
}
.sidebar-nav a.nav-heading {
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--navy);
  margin-top: 12px;
}
.sidebar-nav a.nav-subheading { padding-left: 20px; font-size: 11.5px; }
.sidebar-nav a:hover { background: rgba(26, 82, 118, 0.08); }
.sidebar-nav a.active { background: var(--navy); color: white; }
.sidebar-nav a.nav-subheading.active { background: var(--navy); color: white; }

.main-pane { flex: 1 1 auto; min-width: 0; background: var(--bg); }

.section-toggle {
  display: inline-block;
  width: 14px;
  cursor: pointer;
  transition: transform 0.15s ease;
  user-select: none;
}
.row-heading.collapsed .section-toggle { transform: rotate(-90deg); }
tr[data-section].section-hidden { display: none; }

.toolbar {
  position: sticky;
  top: 0;
  background: var(--navy);
  color: white;
  padding: 10px 18px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 10;
}

.toolbar a { color: #cfe3f5; text-decoration: none; }
.toolbar a.history-link { border: 1px solid rgba(255,255,255,0.3); padding: 4px 10px; border-radius: 4px; font-size: 12px; }
.toolbar a.history-link:hover { background: rgba(255,255,255,0.1); }
.toolbar .filename { font-weight: 600; }
.toolbar label { font-size: 12px; }
.toolbar input[type="number"] {
  border: 1px solid rgba(255,255,255,0.4); border-radius: 4px; padding: 3px 6px; background: rgba(255,255,255,0.9);
}
.toolbar button {
  background: rgba(255,255,255,0.15);
  color: white;
  border: 1px solid rgba(255,255,255,0.3);
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
}
.toolbar button:hover { background: rgba(255,255,255,0.25); }
.toolbar button[type="submit"] { background: #2fa860; border-color: #2fa860; }

.save-status { font-size: 12px; color: #cfe3f5; }
.save-status.error { color: #ffd6d6; font-weight: 600; }

.legend { margin-left: auto; font-size: 12px; display: flex; gap: 6px; align-items: center; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-left: 8px; }

.file-list { list-style: none; padding: 16px; }
.file-item { padding: 6px 0; display: flex; align-items: center; gap: 10px; }
.file-item a { font-size: 14px; }
.file-item.disabled { color: #999; }
.ref-badge { background: #27ae60; color: white; font-size: 11px; padding: 2px 6px; border-radius: 3px; }
.inline-form { display: inline; }
.inline-form button {
  font-size: 11px; padding: 2px 8px; border: 1px solid var(--border); background: var(--bg-chrome);
  border-radius: 3px; cursor: pointer;
}
.hint { padding: 0 16px; color: #888; font-size: 12px; }

.lock-banner {
  background: #fbe8b0;
  color: #6b5100;
  padding: 8px 16px;
  font-size: 13px;
  display: flex;
  gap: 12px;
  align-items: center;
  animation: banner-in 0.25s ease;
}
.lock-banner.conflict { background: #f8d0d0; color: #7a1f1f; }
.lock-banner button {
  border: 1px solid #bbb; background: white; border-radius: 3px; padding: 3px 10px; cursor: pointer;
}
.banner-icon { font-weight: 700; }
@keyframes banner-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.row-table-wrap td { padding: 14px 8px; background: var(--bg); border-bottom: 1px solid var(--border); }
.sub-table-title { font-weight: 600; margin-bottom: 8px; color: var(--text); }
.sub-table-title .item-code { color: var(--text-muted); font-weight: normal; margin-right: 6px; }

.sub-table {
  border-collapse: collapse;
  width: 100%;
  background: var(--bg);
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.sub-table th, .sub-table td {
  border-bottom: 1px solid var(--border);
  padding: 6px 8px;
  text-align: left;
}
.sub-table th { background: var(--bg-chrome); font-weight: 600; color: var(--text); border-bottom: 1px solid var(--border); }
.sub-table .row-name-col { color: var(--text-muted); white-space: nowrap; }
.sub-table td input[type="text"] { width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; }
.sub-table td input[type="text"]:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 2px rgba(26,82,118,0.12); }
.sub-table td.state-EXPIRED { background: var(--expired-bg); }
.sub-table td.state-WARNING { background: var(--warn-bg); }
.sub-table td.state-MISSING { background: var(--missing-bg); }

.na-label.small { font-size: 10px; display: flex; align-items: center; gap: 2px; margin-top: 2px; }

.small-btn {
  font-size: 11px; padding: 4px 11px; border: 1px solid var(--border); background: var(--bg-chrome);
  border-radius: 4px; cursor: pointer; margin-top: 6px;
  display: inline-block; text-decoration: none; color: var(--text);
}
.small-btn:hover { background: #e9edf2; }
.small-btn.danger { background: var(--danger-bg); border-color: #e6a5a5; margin-top: 0; }

.q88-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--bg);
}

.q88-table td {
  border: none;
  border-bottom: 1px solid var(--border);
  padding: 9px 12px;
  vertical-align: top;
}

.row-heading td {
  background: var(--bg-chrome);
  color: var(--navy);
  font-weight: 700;
  font-size: 12.5px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.row-subheading td {
  background: #fbfcfd;
  font-weight: 600;
  color: var(--text);
  border-bottom: 1px solid var(--border);
}

.row-label td { background: var(--bg); color: var(--text-muted); }

.item-code { width: 60px; color: var(--text-muted); font-size: 11.5px; white-space: nowrap; }
.label { width: 35%; }
.col-header { color: var(--text-muted); font-size: 11px; margin-left: 4px; }
.value input {
  width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 4px; padding: 5px 8px;
}
.value input:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 2px rgba(26,82,118,0.12); }
.na-cell { width: 90px; font-size: 11px; white-space: nowrap; color: var(--text-muted); }
.na-label { display: flex; align-items: center; gap: 4px; }

.row-field.state-EXPIRED { background: var(--expired-bg); }
.state-EXPIRED .swatch, .swatch.state-EXPIRED { background: var(--expired); }

.row-field.state-WARNING { background: var(--warn-bg); }
.state-WARNING .swatch, .swatch.state-WARNING { background: var(--warn); }

.row-field.state-MISSING { background: var(--missing-bg); }
.state-MISSING .swatch, .swatch.state-MISSING { background: var(--missing); }

.recently-changed { box-shadow: inset 0 0 0 1px var(--recent); }
.recently-changed .value input, .row-field.recently-changed .value input { border-color: #d4a900; }
.recent-swatch { background: var(--recent); box-shadow: none; }

.issues-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: #e67e22;
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.18);
  z-index: 110;
}
.issues-fab.empty { background: #7f8c8d; }
.issues-fab:hover { filter: brightness(1.08); }

.issues-panel {
  position: fixed;
  bottom: 76px;
  right: 24px;
  width: 420px;
  max-height: 65vh;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 6px 24px rgba(0,0,0,0.18);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(12px);
  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
}
.issues-panel.open { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0); }
.issues-panel-header {
  background: #e67e22;
  color: white;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.issues-panel-header button {
  background: none; border: none; color: white; font-size: 18px; cursor: pointer; line-height: 1;
}
.issues-list { overflow-y: auto; padding: 6px; }
.issue-row {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  text-decoration: none;
  color: #222;
  font-size: 12px;
  border-left: 4px solid transparent;
  margin-bottom: 2px;
}
.issue-row:hover { background: var(--bg-chrome); }
.issue-row.state-EXPIRED { border-left-color: var(--expired); }
.issue-row.state-WARNING { border-left-color: var(--warn); }
.issue-row.state-MISSING { border-left-color: var(--missing); }
.issue-code { color: #888; white-space: nowrap; width: 42px; flex-shrink: 0; }
.issue-label { flex: 1 1 auto; }
.issue-value { color: #999; font-style: italic; white-space: nowrap; }

@keyframes flash-highlight-anim {
  0%, 100% { box-shadow: none; }
  50% { box-shadow: inset 0 0 0 999px rgba(255, 210, 0, 0.5); }
}
.flash-highlight { animation: flash-highlight-anim 0.5s ease-in-out 2; }

/* ---- Home page ---- */
body.home { background: var(--bg-chrome); margin: 0; }

.app-bar {
  background: var(--navy);
  color: white;
  padding: 12px 24px;
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.app-bar-title { font-size: 18px; font-weight: bold; }
.app-bar-sub { font-size: 12px; color: #cfe3f5; }
.app-bar-version { font-size: 11px; color: #9fc3de; font-family: monospace; }

.home-shell {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  max-width: 1600px;
  width: 94%;
  margin: 24px auto;
}
.doc-pane { flex: 1 1 56%; min-width: 0; }
.settings-pane { flex: 1 1 44%; min-width: 340px; display: flex; flex-direction: column; gap: 14px; }
.pane-title { font-size: 15px; color: var(--navy); margin: 4px 0 10px 2px; }

.page { max-width: 900px; margin: -20px auto 40px auto; padding: 0 24px; display: flex; flex-direction: column; gap: 16px; }

.panel {
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 18px 20px;
}
.panel-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; flex-wrap: wrap; gap: 6px; }
.panel-header h2 { margin: 0; font-size: 16px; color: var(--text); }
.panel-hint { font-size: 12px; color: #888; }

.checkbox-line { font-size: 12px; color: #666; display: flex; align-items: center; gap: 6px; }
.checkbox-line.tiny { font-size: 11px; color: #888; }
.primary-btn {
  background: var(--navy); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;
}

.notice { margin-top: 10px; padding: 8px 12px; border-radius: 4px; font-size: 12px; background: var(--bg-chrome); color: var(--text); border-left: 3px solid var(--navy); }
.notice.ok { background: #eaf7ec; color: #1e7a34; border-left-color: #1e7a34; }
.notice.error { background: var(--danger-bg); color: #a12c2c; border-left-color: var(--danger); }

/* --- compact toolbar panel (folder / import / name / sync-all) --- */
.toolbar-panel { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.toolbar-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar-row + .toolbar-row { border-top: 1px solid var(--border); padding-top: 8px; }
.toolbar-folder {
  flex: 1 1 auto; min-width: 80px; font-size: 12px; color: #555;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.toolbar-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; white-space: nowrap; }
.toolbar-actions .inline-form { display: flex; align-items: center; gap: 8px; }
.toolbar-name { font-size: 12px; color: #555; display: flex; align-items: center; gap: 6px; }
.toolbar-name input[type="text"] {
  padding: 4px 6px; border: 1px solid var(--border); border-radius: 3px; font-size: 12px; width: 120px;
}
.toolbar-sync { margin-left: auto; }
.small-btn.primary { background: var(--navy); color: white; border-color: var(--navy); }

.file-search {
  width: 100%; box-sizing: border-box; padding: 7px 10px; border: 1px solid var(--border);
  border-radius: 4px; font-size: 12px; margin-bottom: 10px;
}
.file-search:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 2px rgba(26,82,118,0.12); }
.file-sort { display: flex; gap: 6px; margin-bottom: 10px; }
.file-sort button {
  font-size: 11px; padding: 3px 9px; border: 1px solid var(--border); background: var(--bg);
  border-radius: 4px; cursor: pointer; color: var(--text-muted);
}
.file-sort button.active { background: var(--navy); color: white; border-color: var(--navy); }

.file-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.file-card {
  display: flex; align-items: center; gap: 14px; padding: 14px 16px;
  border: 1px solid var(--border); border-radius: 6px; background: var(--bg); cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.file-card:hover { border-color: var(--navy); }
.file-card.selected { background: var(--navy); border-color: var(--navy); }
.file-card.selected .file-name { color: white; }
.file-card.selected .file-icon { background: white; color: var(--navy); }
.file-card.disabled { background: var(--bg-chrome); cursor: default; }
.file-icon {
  font-size: 10px; font-weight: bold; color: white; background: #3498db;
  padding: 5px 7px; border-radius: 4px; letter-spacing: 0.5px; flex-shrink: 0;
}
.file-card.disabled .file-icon { background: #aaa; }
.file-body { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
.file-name {
  font-size: 14.5px; color: var(--text); text-decoration: none; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.file-name:hover { text-decoration: underline; }
.file-name.muted { color: #999; }
.file-tag { font-size: 11px; width: fit-content; padding: 2px 8px; border-radius: 3px; flex-shrink: 0; }
.file-tag.warn { background: #fbe8b0; color: #6b5100; }
.file-tag.issues { background: #f8d0d0; color: #7a1f1f; }
.file-card.selected .file-tag.issues { background: #fff0f0; }
.file-tag.clean { background: #e5f7e8; color: #1e7a34; }
.empty-hint { color: #999; font-size: 13px; padding: 8px 0; }

/* --- detail panel (issues + recent history for the selected file) --- */
.detail-panel { min-height: 200px; }
.empty-detail { margin: 0; }
.panel-detail-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border);
}
.panel-detail-name { font-size: 13px; font-weight: 600; color: var(--text); word-break: break-all; }
.detail-section + .detail-section { margin-top: 14px; }
.detail-section-head {
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  font-size: 13px; font-weight: 600; color: var(--text); user-select: none;
}
.detail-section-head .section-toggle { font-size: 9px; transition: transform 0.15s ease; }
.detail-section-head.collapsed .section-toggle { transform: rotate(-90deg); }
.detail-count { margin-left: auto; font-size: 11px; color: #888; background: var(--bg-chrome); padding: 1px 7px; border-radius: 8px; }
.detail-section-body { margin-top: 8px; }
.history-table.compact th, .history-table.compact td { padding: 4px 6px; font-size: 11px; }
.history-table.compact { margin-bottom: 8px; }
.history-scroll { max-height: 260px; overflow-y: auto; }
.small-btn.danger { margin-bottom: 8px; }

.issue-row {
  width: 100%; text-align: left; font: inherit; background: none; border-left: 4px solid transparent;
  border-top: none; border-right: none; border-bottom: none;
}

/* --- issue edit/mute modal --- */
.modal-overlay {
  display: none; position: fixed; inset: 0; background: rgba(20, 30, 45, 0.45);
  align-items: center; justify-content: center; z-index: 300;
}
.modal-overlay.open { display: flex; }
.modal-box {
  background: var(--bg); border-radius: 8px; padding: 20px 22px; width: 360px; max-width: 90vw;
  box-shadow: 0 12px 40px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 12px;
}
.modal-title { margin: 0; font-size: 14px; color: var(--text); }
.modal-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #555; }
.modal-field input[type="text"] { padding: 7px 9px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

.history-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.history-table th, .history-table td { border: 1px solid var(--border); padding: 6px 8px; text-align: left; vertical-align: top; }
.history-table th { background: var(--bg-chrome); }
.history-table .nowrap { white-space: nowrap; color: #666; }
.history-table .old-val { color: #a12c2c; }
.history-table .new-val { color: #1e7a34; }
.history-table .rename-row td { background: var(--bg-chrome); font-style: italic; }

.danger-btn {
  background: var(--danger); color: white; border: none; padding: 6px 14px;
  border-radius: 4px; cursor: pointer; margin-left: auto;
}
```

- [ ] **Step 2: Verify no more `.toast` rules and the file parses as valid CSS**

Run:
```bash
grep -c "\.toast" "static/style.css"
```
Expected: `0` (the toast rules were intentionally dropped — Task 3 removes the corresponding markup/JS).

- [ ] **Step 3: Start the dev server and confirm the stylesheet is served**

Run (from the project root, in the background):
```bash
start_server.bat
```
Then:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/static/style.css
```
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add static/style.css
git commit -m "Redesign: flat navy design-token stylesheet"
```

---

### Task 2: Document editor — inline save status, banner icon, issue-panel polish

**Files:**
- Modify: `templates/document.html:38-57` (toolbar block), `templates/document.html:27-37` (lock/conflict banners)
- Modify: `static/app.js:107-148` (AJAX submit handler), `static/app.js:150-180` (issues panel)

**Interfaces:**
- Consumes: `.save-status`, `.save-status.error`, `.banner-icon` CSS classes from Task 1's `static/style.css`.
- Produces: no new functions consumed elsewhere; `q88InitPage()` signature unchanged (still called from `DOMContentLoaded` and recursively after AJAX swap).

- [ ] **Step 1: Add icons to the toolbar links so it reads as an icon+label button group (spec: Layout & Navigation)**

Replace:
```html
        <div class="toolbar">
          <a href="{{ url_for('index') }}">&larr; Files</a>
          <span class="app-bar-version">v{{ app_version }}</span>
          <span class="filename">{{ filename }}</span>
          <a href="{{ url_for('history', filename=filename) }}" class="history-link">History</a>
```
with:
```html
        <div class="toolbar">
          <a href="{{ url_for('index') }}">&#128193; Files</a>
          <span class="app-bar-version">v{{ app_version }}</span>
          <span class="filename">{{ filename }}</span>
          <a href="{{ url_for('history', filename=filename) }}" class="history-link">&#128337; History</a>
```

- [ ] **Step 2: Replace the toolbar save button block in `templates/document.html`**

Replace:
```html
          {% if not read_only %}<button type="submit">Save</button>{% endif %}
          {% if saved %}<span class="saved-msg">Saved</span>{% endif %}
```
with:
```html
          {% if not read_only %}<button type="submit">Save</button>{% endif %}
          <span class="save-status" id="save-status"></span>
```

- [ ] **Step 3: Add icons to the lock/conflict banners in `templates/document.html`**

Replace:
```html
      {% if read_only %}
        <div class="lock-banner">
          {{ lock_holder_name }} is currently editing this file, so it's open read-only. It will become editable automatically once they're done.
          <button type="button" id="refresh-lock-btn">Refresh</button>
        </div>
      {% endif %}
      {% if conflict %}
        <div class="lock-banner conflict">
          Someone else opened this file while you were editing, so your save was rejected. Please refresh and try again.
        </div>
      {% endif %}
```
with:
```html
      {% if read_only %}
        <div class="lock-banner">
          <span class="banner-icon">&#128274;</span>
          {{ lock_holder_name }} is currently editing this file, so it's open read-only. It will become editable automatically once they're done.
          <button type="button" id="refresh-lock-btn">Refresh</button>
        </div>
      {% endif %}
      {% if conflict %}
        <div class="lock-banner conflict">
          <span class="banner-icon">&#9888;</span>
          Someone else opened this file while you were editing, so your save was rejected. Please refresh and try again.
        </div>
      {% endif %}
```

- [ ] **Step 4: Replace the AJAX submit handler in `static/app.js` to drive the inline save status**

Replace the whole `form.addEventListener("submit", ...)` block (lines 123-147) with:

```javascript
    var saveStatus = document.getElementById("save-status");
    function setSaveStatus(text, isError) {
      if (!saveStatus) return;
      saveStatus.textContent = text;
      saveStatus.classList.toggle("error", !!isError);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var submitter = e.submitter;
      var url = (submitter && submitter.getAttribute("formaction")) || form.action;
      var formData = new FormData(form);
      sessionStorage.setItem(scrollKey, window.scrollY);
      setSaveStatus("Saving...", false);

      fetch(url, { method: "POST", body: formData })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var newDoc = new DOMParser().parseFromString(html, "text/html");
          document.body.innerHTML = newDoc.body.innerHTML;
          document.body.className = newDoc.body.className;
          document.body.setAttribute("data-filename", newDoc.body.getAttribute("data-filename"));
          document.body.setAttribute("data-readonly", newDoc.body.getAttribute("data-readonly"));
          document.title = newDoc.title;
          dirty = false;
          q88InitPage();
          var now = new Date();
          var hh = String(now.getHours()).padStart(2, "0");
          var mm = String(now.getMinutes()).padStart(2, "0");
          var status = document.getElementById("save-status");
          if (status) { status.textContent = "Saved at " + hh + ":" + mm; status.classList.remove("error"); }
        })
        .catch(function () {
          setSaveStatus("Save failed - retrying...", true);
          // network hiccup - fall back to a normal submit so the edit isn't lost
          // (HTMLFormElement.submit() bypasses the "submit" event, so this won't loop)
          form.submit();
        });
    });
```

- [ ] **Step 5: Verify `static/app.js` no longer references `.saved-msg`**

Run:
```bash
grep -rn "saved-msg" templates static
```
Expected: no matches.

- [ ] **Step 6: Manual verification**

Start the server (`start_server.bat`), open any vessel `.docx` from the home page, edit a field, click Save, and confirm:
- The toolbar shows icons next to "Files"/"History", then "Saving..." then "Saved at HH:MM" (no floating message).
- Opening the same file in a second browser/profile shows the read-only lock banner with a lock icon; forcing a conflict (edit in both, save the second one) shows the conflict banner with a warning icon.

- [ ] **Step 7: Commit**

```bash
git add templates/document.html static/app.js
git commit -m "Editor: inline save status and banner icons"
```

---

### Task 3: Home page — remove floating toast, add search/sort to file list

**Files:**
- Modify: `templates/index.html:16-49` (doc-pane block), `templates/index.html:102-110` (toast block, to delete)
- Modify: `static/home.js:1-10` (toast handler, to delete), `static/home.js` (add filter/sort, new code)
- Modify: `app.py:79-89` (`list_files()` — add `mtime` per file)

**Interfaces:**
- Consumes: `.file-search`, `.file-sort` CSS classes from Task 1's `static/style.css`.
- Produces: `list_files()` dicts now always include a `"mtime"` int key (epoch seconds) in addition to the existing `"name"`/`"supported"` keys — no other route reads this dict shape today, so this is additive only.
- Produces (for later use, none consumed by other tasks in this plan): none. This task is self-contained home-page behavior. Existing `selectCard(card)` and `refreshPanel(filename)` functions keep their current signatures since `home.js`'s modal/detail-panel code (untouched in this task) calls them.

- [ ] **Step 1: Delete the toast block from `templates/index.html`**

Replace:
```html
  {% if style_applied %}
    <div id="toast" class="toast">
      {% if style_count and style_count|int > 0 %}
        Style synced: {{ style_count }} value cell(s) updated{% if style_files and style_files|int > 1 %} across {{ style_files }} file(s){% endif %}.
      {% else %}
        {{ style_applied }} already matched the reference style - nothing to change.
      {% endif %}
    </div>
  {% endif %}

  <script src="{{ url_for('static', filename='home.js') }}"></script>
```
with:
```html
  <script src="{{ url_for('static', filename='home.js') }}"></script>
```

(The equivalent message already renders inline via the existing `.notice.ok` block at `templates/index.html:83-91` — no information is lost.)

- [ ] **Step 2: Add a search input and sort buttons above the file list in `templates/index.html`**

Replace:
```html
    <section class="doc-pane panel">
      <div class="panel-header">
        <h2>Vessel files</h2>
      </div>
      <ul class="file-list">
```
with:
```html
    <section class="doc-pane panel">
      <div class="panel-header">
        <h2>Vessel files</h2>
      </div>
      <input type="text" id="file-search" class="file-search" placeholder="Filter by filename...">
      <div class="file-sort">
        <button type="button" data-sort="name" class="active">Name</button>
        <button type="button" data-sort="date">Date modified</button>
      </div>
      <ul class="file-list" id="file-list">
```

- [ ] **Step 3: Add `mtime` to `list_files()` in `app.py` so the client can sort by date**

`app.py`'s `list_files(folder)` (around line 79) currently builds each file dict without a modified-time field. Replace:
```python
def list_files(folder):
    files = []
    for name in sorted(os.listdir(folder)):
        lower = name.lower()
        if lower.endswith(".original_backup.docx") or lower.endswith(".original_backup.doc"):
            continue
        if lower.endswith(".docx"):
            files.append({"name": name, "supported": True})
        elif lower.endswith(".doc"):
            files.append({"name": name, "supported": False})
    return files
```
with:
```python
def list_files(folder):
    files = []
    for name in sorted(os.listdir(folder)):
        lower = name.lower()
        if lower.endswith(".original_backup.docx") or lower.endswith(".original_backup.doc"):
            continue
        mtime = int(os.path.getmtime(os.path.join(folder, name)))
        if lower.endswith(".docx"):
            files.append({"name": name, "supported": True, "mtime": mtime})
        elif lower.endswith(".doc"):
            files.append({"name": name, "supported": False, "mtime": mtime})
    return files
```

- [ ] **Step 4: Add a `data-mtime` attribute to each file card in `templates/index.html`**

Replace:
```html
          <li class="{{ 'file-card' if f.supported else 'file-card disabled' }}"
              {% if f.supported %}data-filename="{{ f.name }}"{% endif %}>
```
with:
```html
          <li class="{{ 'file-card' if f.supported else 'file-card disabled' }}"
              data-mtime="{{ f.mtime }}"
              {% if f.supported %}data-filename="{{ f.name }}"{% endif %}>
```

- [ ] **Step 5: Verify `app.py` still compiles**

Run:
```bash
python -m py_compile app.py
```
Expected: no output, exit code 0.

- [ ] **Step 6: Remove the toast handler from `static/home.js`**

Replace:
```javascript
document.addEventListener("DOMContentLoaded", function () {
  // --- toast ---
  var toast = document.getElementById("toast");
  if (toast) {
    requestAnimationFrame(function () { toast.classList.add("show"); });
    setTimeout(function () { toast.classList.remove("show"); }, 4000);
  }
  document.querySelectorAll(".notice").forEach(function (el) {
```
with:
```javascript
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".notice").forEach(function (el) {
```

- [ ] **Step 7: Add filter/sort behavior to `static/home.js`**

Insert this block right after the `cards.forEach(...)` click/dblclick wiring (after the closing `});` that follows the `dblclick` handler, i.e. right before the `// --- issue edit/mute modal ---` comment):

```javascript
  // --- search + sort ---
  var searchInput = document.getElementById("file-search");
  var fileList = document.getElementById("file-list");
  var sortButtons = document.querySelectorAll(".file-sort button");

  function applyFilter() {
    var q = (searchInput.value || "").toLowerCase();
    cards.forEach(function (card) {
      var name = (card.getAttribute("data-filename") || card.textContent || "").toLowerCase();
      card.style.display = name.indexOf(q) === -1 ? "none" : "";
    });
  }
  if (searchInput) {
    searchInput.addEventListener("input", applyFilter);
  }

  function applySort(key) {
    if (!fileList) return;
    var items = Array.prototype.slice.call(cards);
    items.sort(function (a, b) {
      if (key === "date") {
        return (parseInt(b.getAttribute("data-mtime"), 10) || 0) - (parseInt(a.getAttribute("data-mtime"), 10) || 0);
      }
      var an = (a.getAttribute("data-filename") || "").toLowerCase();
      var bn = (b.getAttribute("data-filename") || "").toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    items.forEach(function (item) { fileList.appendChild(item); });
  }
  sortButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      sortButtons.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      applySort(btn.getAttribute("data-sort"));
    });
  });
```

- [ ] **Step 8: Verify the toast markup/JS is fully gone**

Run:
```bash
grep -rn "toast" templates static
```
Expected: no matches.

- [ ] **Step 9: Manual verification**

Start the server, open the home page, confirm:
- No floating toast appears after "Sync font/size/color across all files" — the existing green `.notice` banner shows the same message inline.
- Typing in the filter box hides non-matching file cards live.
- Clicking "Date modified" reorders cards newest-first; clicking "Name" restores alphabetical order.

- [ ] **Step 10: Commit**

```bash
git add templates/index.html static/home.js app.py
git commit -m "Home: remove floating toast, add file search/sort"
```

---

### Task 4: Full verification pass (this project's `/survey`)

**Files:** none modified — verification only.

- [ ] **Step 1: Python still compiles clean**

Run:
```bash
python -m py_compile app.py q88/*.py
```
Expected: no output, exit code 0.

- [ ] **Step 2: Route/template/JS cross-check**

Run:
```bash
grep -n "url_for\|fetch(\|action=" templates/*.html static/app.js static/home.js
```
Manually confirm every `fetch(...)`/form `action` target still matches an existing route in `app.py` (no route names changed by this plan, so this should be a no-op check).

- [ ] **Step 3: Hard-rule scan**

Run:
```bash
grep -rn "except:" app.py q88/*.py
```
Expected: no matches (only `except Exception:` allowed).

- [ ] **Step 4: Full manual walkthrough**

With the server running, walk through: home page (search/sort/select/open), document editor (save status, collapse/expand, issues FAB panel open/scroll/highlight, lock banner via a second session), history page, revert flow. Confirm nothing regressed functionally and the visuals match the flat/navy design from the spec.

- [ ] **Step 5: Final commit (if Step 4 surfaces small CSS fixes)**

```bash
git add -A
git commit -m "UI redesign: polish pass after manual walkthrough"
```

---

## After this plan

Per the user's explicit request, once this plan is fully executed the next steps (outside this plan's scope, run as this project's own session commands from `CLAUDE.md` Section 6) are, in order: `/survey`, `audit` skill, `/dock`.
