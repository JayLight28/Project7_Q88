# UI/UX Redesign — Q88 Check (2026-07-01)

## Goal
Redesign the visual layer and selected UX flows of Q88 Check to a minimal flat style (Notion/Linear-like), modeled on the reference OCIMF Particulars Editor desktop app screenshots. No route/API/data-structure changes.

## Reference
OCIMF Particulars Editor desktop app (user-provided screenshots):
- Flat sidebar: bold caps section headings, indented numbered subsections, selected item = solid navy fill + white text, no other decoration
- Top toolbar: icon+label button group, flat navy background, no shadow/gradient
- Inline save feedback: "Saved at HH:MM" text in toolbar center, not a floating toast
- Home screen: document list (cards, selected = solid navy) + secondary info panel, two-column layout, flat dividers

## Scope
- **In scope:** `static/style.css` (full rewrite), `static/app.js` / `static/home.js` (interaction logic only — feedback mechanism, animations, no new endpoints), `templates/*.html` (class names / markup structure only — Jinja logic and form field names unchanged)
- **Out of scope:** `app.py` routes, `q88/*.py` logic, data model, field/table schema, lock/history/state semantics

## Design

### 1. Layout & Navigation
- Sidebar keeps existing structure (section heading rows + sub-item rows) but simplifies visual states: only the active item gets solid navy fill (#1a5276) + white text; hover gets a pale background tint only. Remove current heavier borders/weights.
- Top toolbar restructured from text-heavy row to icon+label button group (mirroring reference: e.g. Details/History/Search/Release-lock/Close equivalents mapped to existing actions — history link, release lock, save, folder actions). Flat navy background, no box-shadow.
- Save feedback moves from the floating `.toast` (top-center slide-down) to an inline status text in the toolbar: "Saved at HH:MM" on success, red inline text on error. Toast markup/JS removed; replaced by a toolbar status span with a small state machine (idle → saving → saved/error) already implied by existing save flow in `app.js`.

### 2. Color & Typography
- Keep navy family, slightly desaturated (#1a5276 primary, existing #14507e darker variant retained for emphasis only).
- Backgrounds reduced to two tiers: white (#ffffff) content, light gray (#f7f8fa) chrome/sidebar. Drop intermediate grays (#eaf1f9, #f4f6f9 etc. consolidated).
- Slightly smaller base font size, increased padding/line-height for whitespace ("Notion-like" density).

### 3. Tables & Form Fields
- Input borders thinner (1px, low-contrast), emphasis only on `:focus`.
- Status states (EXPIRED/WARNING/MISSING) drop the left color bar in favor of a subtle full-cell background tint only (matches reference's plain aesthetic); swatches/legend keep color coding for reference.
- Sub-tables get cleaner header/divider styling to match reference dropdown/table look ("Please Choose..." style selects, if any select inputs exist — otherwise just header/border cleanup).

### 4. UX Flow Improvements
- **Save feedback:** toast → inline toolbar text (see Layout section). Also apply same inline pattern to field-level autosave indicator if present in `app.js`.
- **File list / detail panel:** home page keeps card list + detail panel two-pane layout; add a search/filter input above the file card list (client-side filter only, no new route) and sort affordance (by name/date, client-side).
- **Issue panel / table flow:** keep FAB + slide-up panel; smooth the scroll-to-row jump (`scrollIntoView` behavior) with a brief highlight animation on arrival (reusing existing `.flash-highlight` keyframe where possible); no new backend calls.
- **Lock/conflict banners:** keep existing color semantics (`.lock-banner` amber, `.lock-banner.conflict` red) but add a leading icon and an enter/exit transition instead of abrupt show/hide.

### 5. Testing
- No automated UI tests exist for this app. Verification = manual: launch `start_server.bat`, open a document, confirm sidebar nav, save flow (inline "Saved at HH:MM"), issue panel scroll/highlight, lock banner (simulate second browser/session), home page search/sort — all functionally unchanged, visually updated.
- `python -m py_compile app.py q88/*.py` after any Python touch (none expected, but part of the eventual `/survey` step).

## Non-goals
- No new routes, no new persisted fields, no schema changes to `q88/state.py` history format.
- No dark mode (explicitly declined).
- No framework/build-step introduction (stays vanilla JS/CSS, no bundler).
