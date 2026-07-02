# Date Normalization + Tiered Expiry Warnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize every date field in Q88 documents to dd-mmm-yyyy with a native calendar picker, and replace the single configurable expiry-warning threshold with fixed 30/60/90-day tiers that are visible on the home page without opening a file.

**Architecture:** All date parsing/formatting/classification logic lives in `q88/rules.py` (already owns this per existing convention). `app.py` routes stay thin - they call `rules.classify()`/`rules.format_date()`/`rules.normalize_incoming_date()` and wire results into templates. No new dependencies, no external JS libraries (native `<input type="date">`).

**Tech Stack:** Flask, python-docx, python-dateutil (existing). Adds `pytest` as a dev-only dependency for `q88/rules.py` unit tests (pure functions, no Flask/docx fixtures needed).

## Global Constraints

- ASCII-only output in all code/UI text; warnings/labels stay in English (not translated) - confirmed by user.
- No inline date math outside `q88/rules.py` (existing) or `app.py`'s `_maybe_rename_by_date_field`/`FILENAME_RE` area - don't scatter date parsing into a third location.
- No bare `except:` - always `except Exception:` or a specific exception type.
- Minimal diff - targeted edits, not full-file rewrites.
- No external CDN/JS libraries - shared network folder, must work fully offline.
- Never hand-edit `q88/__pycache__`.

---

### Task 1: `rules.py` - locale-safe `format_date()` helper

**Files:**
- Modify: `q88/rules.py`
- Test: `tests/test_rules.py` (new file)

**Interfaces:**
- Produces: `rules.format_date(d: datetime.date) -> str`, e.g. `format_date(datetime.date(2026, 7, 2)) == "02-Jul-2026"`. Never uses `strftime("%b")` (locale-dependent); uses a hardcoded `MONTH_ABBR` list.

- [ ] **Step 1: Write the failing test**

Create `tests/test_rules.py`:

```python
import datetime
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from q88 import rules


def test_format_date_basic():
    assert rules.format_date(datetime.date(2026, 7, 2)) == "02-Jul-2026"


def test_format_date_pads_single_digit_day():
    assert rules.format_date(datetime.date(2026, 1, 9)) == "09-Jan-2026"


def test_format_date_december():
    assert rules.format_date(datetime.date(2026, 12, 25)) == "25-Dec-2026"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_rules.py -v`
Expected: FAIL with `AttributeError: module 'q88.rules' has no attribute 'format_date'`

- [ ] **Step 3: Write minimal implementation**

In `q88/rules.py`, add near the top (after the existing `EXPIRY_KEYWORDS`/`HISTORICAL_KEYWORDS` block, before `STATE_OK`):

```python
MONTH_ABBR = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def format_date(d):
    """dd-mmm-yyyy, locale-independent (never relies on strftime('%b'),
    which can render non-English month names on a non-English Windows box)."""
    return f"{d.day:02d}-{MONTH_ABBR[d.month - 1]}-{d.year:04d}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_rules.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add q88/rules.py tests/test_rules.py requirements-dev.txt
git commit -m "Add locale-safe format_date() helper to rules.py"
```

(Note: `requirements-dev.txt` is created in this step too - see Task 0 note below. If it doesn't exist yet, create it first with content `pytest`.)

---

### Task 2: `rules.py` - `normalize_incoming_date()` for ISO-from-date-input conversion

**Files:**
- Modify: `q88/rules.py`
- Test: `tests/test_rules.py`

**Interfaces:**
- Consumes: `rules.format_date()` from Task 1.
- Produces: `rules.normalize_incoming_date(raw: str) -> str`. If `raw` matches `yyyy-mm-dd` (what a native `<input type="date">` submits) and is a valid calendar date, returns `format_date()` of it. Otherwise returns `raw` unchanged (covers empty string, already-formatted dd-mmm-yyyy text, or anything else typed into a plain text field).

- [ ] **Step 1: Write the failing test**

Append to `tests/test_rules.py`:

```python
def test_normalize_incoming_date_converts_iso():
    assert rules.normalize_incoming_date("2026-07-02") == "02-Jul-2026"


def test_normalize_incoming_date_passes_through_empty():
    assert rules.normalize_incoming_date("") == ""


def test_normalize_incoming_date_passes_through_non_iso():
    assert rules.normalize_incoming_date("02-Jul-2026") == "02-Jul-2026"
    assert rules.normalize_incoming_date("N/A") == "N/A"


def test_normalize_incoming_date_passes_through_invalid_iso_shape():
    assert rules.normalize_incoming_date("2026-13-99") == "2026-13-99"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_rules.py -v`
Expected: FAIL with `AttributeError: module 'q88.rules' has no attribute 'normalize_incoming_date'`

- [ ] **Step 3: Write minimal implementation**

In `q88/rules.py`, add right after `format_date`:

```python
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def normalize_incoming_date(raw):
    """Convert a native <input type="date"> submission (always yyyy-mm-dd)
    into dd-mmm-yyyy. Anything that isn't exactly that ISO shape, or isn't
    a valid calendar date, passes through unchanged."""
    if not ISO_DATE_RE.match(raw or ""):
        return raw
    try:
        d = datetime.date.fromisoformat(raw)
    except ValueError:
        return raw
    return format_date(d)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_rules.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add q88/rules.py tests/test_rules.py
git commit -m "Add normalize_incoming_date() for date-input ISO conversion"
```

---

### Task 3: `rules.py` - tiered expiry classification (30/60/90 days)

**Files:**
- Modify: `q88/rules.py`
- Test: `tests/test_rules.py`

**Interfaces:**
- Produces: `classify(label, column_header, text, today=None)` (the `warning_days` parameter is **removed**). Returns `(state, parsed_date_or_None)` where `state` is one of `"OK"`, `"MISSING"`, `"NOT_APPLICABLE"`, `"HISTORICAL"`, `"EXPIRED"`, `"DUE_30"`, `"DUE_60"`, `"DUE_90"`.
- Produces: `STATE_DUE_30 = "DUE_30"`, `STATE_DUE_60 = "DUE_60"`, `STATE_DUE_90 = "DUE_90"` constants (STATE_WARNING is removed).
- Produces: `HIGHLIGHTABLE = {STATE_MISSING, STATE_EXPIRED, STATE_DUE_30, STATE_DUE_60, STATE_DUE_90}`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_rules.py`:

```python
def test_classify_expired():
    today = datetime.date(2026, 7, 2)
    state, parsed = rules.classify("Next survey due", None, "01-Jul-2026", today=today)
    assert state == "EXPIRED"
    assert parsed == datetime.date(2026, 7, 1)


def test_classify_due_30():
    today = datetime.date(2026, 7, 2)
    state, _ = rules.classify("Certificate expiry", None, "20-Jul-2026", today=today)
    assert state == "DUE_30"


def test_classify_due_60():
    today = datetime.date(2026, 7, 2)
    state, _ = rules.classify("Certificate expiry", None, "20-Aug-2026", today=today)
    assert state == "DUE_60"


def test_classify_due_90():
    today = datetime.date(2026, 7, 2)
    state, _ = rules.classify("Certificate expiry", None, "20-Sep-2026", today=today)
    assert state == "DUE_90"


def test_classify_ok_beyond_90_days():
    today = datetime.date(2026, 7, 2)
    state, _ = rules.classify("Certificate expiry", None, "20-Dec-2026", today=today)
    assert state == "OK"


def test_classify_boundary_30_days_is_due_30():
    today = datetime.date(2026, 7, 2)
    state, _ = rules.classify("Certificate expiry", None, "01-Aug-2026", today=today)
    assert state == "DUE_30"


def test_highlightable_has_all_tiers():
    assert rules.HIGHLIGHTABLE == {"MISSING", "EXPIRED", "DUE_30", "DUE_60", "DUE_90"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_rules.py -v`
Expected: FAIL - `classify()` still returns `"WARNING"` for the due-soon cases, and `test_highlightable_has_all_tiers` fails because `HIGHLIGHTABLE` still contains `"WARNING"` not the tier names.

- [ ] **Step 3: Write minimal implementation**

In `q88/rules.py`, replace the state constants block:

```python
STATE_OK = "OK"
STATE_MISSING = "MISSING"
STATE_NA = "NOT_APPLICABLE"
STATE_EXPIRED = "EXPIRED"
STATE_WARNING = "WARNING"
STATE_HISTORICAL = "HISTORICAL"

HIGHLIGHTABLE = {STATE_MISSING, STATE_EXPIRED, STATE_WARNING}
```

with:

```python
STATE_OK = "OK"
STATE_MISSING = "MISSING"
STATE_NA = "NOT_APPLICABLE"
STATE_EXPIRED = "EXPIRED"
STATE_DUE_30 = "DUE_30"
STATE_DUE_60 = "DUE_60"
STATE_DUE_90 = "DUE_90"
STATE_HISTORICAL = "HISTORICAL"

HIGHLIGHTABLE = {STATE_MISSING, STATE_EXPIRED, STATE_DUE_30, STATE_DUE_60, STATE_DUE_90}
```

Then replace the `classify` function body (the final block, from `delta_days = ...` to the end):

```python
def classify(label, column_header, text, today=None):
    """Return (state, parsed_date_or_None)."""
    today = today or datetime.date.today()
    t = (text or "").strip()

    if t == "":
        return STATE_MISSING, None

    if _normalize_na(t) in {v.replace(" ", "") for v in NA_VALUES}:
        return STATE_NA, None

    parsed = try_parse_date(t)
    if parsed is None:
        return STATE_OK, None

    keywords = f"{label or ''} {column_header or ''}".lower()
    is_historical = any(k in keywords for k in HISTORICAL_KEYWORDS)
    is_expiry = any(k in keywords for k in EXPIRY_KEYWORDS)

    if is_historical and not is_expiry:
        return STATE_HISTORICAL, parsed
    if not is_expiry:
        return STATE_OK, parsed

    delta_days = (parsed - today).days
    if delta_days < 0:
        return STATE_EXPIRED, parsed
    if delta_days <= 30:
        return STATE_DUE_30, parsed
    if delta_days <= 60:
        return STATE_DUE_60, parsed
    if delta_days <= 90:
        return STATE_DUE_90, parsed
    return STATE_OK, parsed
```

Note the function signature dropped `warning_days=60` - the 90-day ceiling and the 30/60 sub-tiers are now fixed constants inline.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_rules.py -v`
Expected: 13 passed

- [ ] **Step 5: Commit**

```bash
git add q88/rules.py tests/test_rules.py
git commit -m "Replace single WARNING threshold with fixed 30/60/90-day expiry tiers"
```

---

### Task 4: `app.py` - remove `warning_days` plumbing

**Files:**
- Modify: `app.py:20` (remove `DEFAULT_WARNING_DAYS`)
- Modify: `app.py:150` (`_compute_issues` signature)
- Modify: `app.py:165, 171` (`_compute_issues` body - `state_order`, `rules.classify` call)
- Modify: `app.py:423-434` (`open_file` - warning_days read, `classify_cell`, `rules.classify` call)
- Modify: `app.py:429` (`open_file`'s `state_order` dict)
- Modify: `app.py:481` (table-row `state_order` lookup in `open_file`)
- Modify: `app.py:497-510` (`render_template` call - drop `warning_days=warning_days`)
- Modify: `app.py:795-846` (`save_file`, `save_as` - drop warning_days read + all `warning_days=warning_days` in redirects)
- Modify: `app.py:849-902` (`add_row`, `delete_row` - same)

**Interfaces:**
- Consumes: `rules.classify(label, column_header, text, today=None)` from Task 3 (no `warning_days` kwarg).
- Produces: `_compute_issues(path, ext=None)` (no `warning_days` param) - used by `_quick_scan` (Task 6) and `/panel`.

- [ ] **Step 1: Remove the constant**

In `app.py`, delete line 20:

```python
DEFAULT_WARNING_DAYS = 60
```

- [ ] **Step 2: Update `_compute_issues`**

Replace (around line 150):

```python
def _compute_issues(path, warning_days=DEFAULT_WARNING_DAYS, ext=None):
```

with:

```python
def _compute_issues(path, ext=None):
```

Replace (around line 165):

```python
    state_order = {"EXPIRED": 0, "WARNING": 1, "MISSING": 2}
```

with:

```python
    state_order = {"EXPIRED": 0, "DUE_30": 1, "DUE_60": 2, "DUE_90": 3, "MISSING": 4}
```

Replace (around line 171):

```python
        state, _ = rules.classify(label, col, cell.text.strip(), warning_days=warning_days, today=today)
```

with:

```python
        state, _ = rules.classify(label, col, cell.text.strip(), today=today)
```

- [ ] **Step 3: Update `open_file`**

Delete the line (around line 423):

```python
    warning_days = int(request.args.get("warning_days", DEFAULT_WARNING_DAYS))
```

Replace the `state_order` dict (around line 429):

```python
    state_order = {"EXPIRED": 0, "WARNING": 1, "MISSING": 2}
```

with:

```python
    state_order = {"EXPIRED": 0, "DUE_30": 1, "DUE_60": 2, "DUE_90": 3, "MISSING": 4}
```

Replace the `rules.classify` call inside `classify_cell` (around line 432-435):

```python
        computed_state, _ = rules.classify(
            label, column_header, cell_rec["text"],
            warning_days=warning_days, today=today,
        )
```

with:

```python
        computed_state, _ = rules.classify(
            label, column_header, cell_rec["text"], today=today,
        )
```

Remove `warning_days=warning_days,` from the `render_template("document.html", ...)` call (around line 503).

- [ ] **Step 4: Update `save_file`, `save_as`, `add_row`, `delete_row`**

In each of these four route functions, delete the line reading `warning_days` (e.g. `warning_days = int(request.form.get("warning_days", DEFAULT_WARNING_DAYS))`) and remove `warning_days=warning_days, ` (or trailing `, warning_days=warning_days`) from every `url_for("open_file", ...)` call inside that function. Concretely:

`save_file` (around line 795-815): delete line 795; change line 797 `redirect(url_for("open_file", filename=filename, warning_days=warning_days, conflict=1))` to `redirect(url_for("open_file", filename=filename, conflict=1))`; change line 815 `redirect(url_for("open_file", filename=new_filename, warning_days=warning_days, saved=1))` to `redirect(url_for("open_file", filename=new_filename, saved=1))`.

`save_as` (around line 818-846): delete line 825; change line 827 to `redirect(url_for("open_file", filename=filename, conflict=1))`; change line 831 to `redirect(url_for("open_file", filename=filename, save_as_error="empty"))`; change line 838 to `redirect(url_for("open_file", filename=filename, save_as_error="exists"))`; change line 846 to `redirect(url_for("open_file", filename=filename, saved_as=new_name))`.

`add_row` (around line 849-876): delete line 854; change line 856 to `redirect(url_for("open_file", filename=filename, conflict=1))`; change line 876 to `redirect(url_for("open_file", filename=filename))`.

`delete_row` (around line 879-902): delete line 884; change line 886 to `redirect(url_for("open_file", filename=filename, conflict=1))`; change line 902 to `redirect(url_for("open_file", filename=filename))`.

- [ ] **Step 5: Verify no `warning_days` references remain**

Run: `grep -n warning_days app.py`
Expected: no output (empty result).

- [ ] **Step 6: Syntax check**

Run: `python -m py_compile app.py q88/rules.py`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add app.py
git commit -m "Remove configurable warning_days in favor of fixed 30/60/90 tiers"
```

---

### Task 5: `templates/document.html` + `static/app.js` - remove warning-days UI

**Files:**
- Modify: `templates/document.html:46-64`
- Modify: `static/app.js:8-24`

**Interfaces:**
- Consumes: `open_file` no longer passes `warning_days` to the template (Task 4) - the template must not reference `{{ warning_days }}` anywhere.

- [ ] **Step 1: Remove the warning-days control from the toolbar**

In `templates/document.html`, delete these lines (around 46-50):

```html
          <label>Warn within (days):
            <input type="number" name="warning_days_view" id="warning_days_view" value="{{ warning_days }}" min="0" style="width:4em" {{ 'disabled' if read_only }}>
          </label>
          <button type="button" id="apply-warning-days" {{ 'disabled' if read_only }}>Apply</button>
          <input type="hidden" name="warning_days" id="warning_days" value="{{ warning_days }}">
```

- [ ] **Step 2: Update the legend**

Replace (around line 59-64):

```html
          <span class="legend">
            <span class="swatch state-EXPIRED"></span>Expired
            <span class="swatch state-WARNING"></span>Expiring soon
            <span class="swatch state-MISSING"></span>Missing
            <span class="swatch recent-swatch"></span>Recently changed
          </span>
```

with:

```html
          <span class="legend">
            <span class="swatch state-EXPIRED"></span>Expired
            <span class="swatch state-DUE_30"></span>Due &lt;=30d
            <span class="swatch state-DUE_60"></span>Due &lt;=60d
            <span class="swatch state-DUE_90"></span>Due &lt;=90d
            <span class="swatch state-MISSING"></span>Missing
            <span class="swatch recent-swatch"></span>Recently changed
          </span>
```

- [ ] **Step 3: Remove the warning-days JS wiring**

In `static/app.js`, delete this block (around lines 8-24):

```javascript
  // --- warning-days control ---
  var viewInput = document.getElementById("warning_days_view");
  var hiddenInput = document.getElementById("warning_days");
  var applyBtn = document.getElementById("apply-warning-days");

  if (viewInput && hiddenInput) {
    viewInput.addEventListener("input", function () {
      hiddenInput.value = viewInput.value;
    });
  }
  if (applyBtn) {
    applyBtn.addEventListener("click", function () {
      var url = new URL(window.location.href);
      url.searchParams.set("warning_days", viewInput.value);
      window.location.href = url.toString();
    });
  }

```

- [ ] **Step 4: Manual verification**

Start the app (`python app.py` or `start_server.bat`), open any document. Confirm: no "Warn within (days)" control in the toolbar; legend shows Expired / Due <=30d / Due <=60d / Due <=90d / Missing / Recently changed; page loads without JS console errors.

- [ ] **Step 5: Commit**

```bash
git add templates/document.html static/app.js
git commit -m "Remove warning-days UI, show fixed 30/60/90 tiers in legend"
```

---

### Task 6: `static/style.css` - tier colors for document page

**Files:**
- Modify: `static/style.css:1-17` (`:root` variables)
- Modify: `static/style.css:172-174` (sub-table state backgrounds)
- Modify: `static/style.css:229-236` (row-field state backgrounds + swatches)
- Modify: `static/style.css:305-307` (issue-row border colors)

**Interfaces:**
- Consumes: `state-DUE_30`, `state-DUE_60`, `state-DUE_90` classes emitted by `templates/document.html` and `templates/_panel.html` wherever `state-{{ ...state }}` is rendered (Task 3's new tier names flow through unchanged since those templates already do `state-{{ row.display_state }}` / `state-{{ iss.state }}` generically).

- [ ] **Step 1: Add CSS variables**

In `static/style.css`, inside `:root` (after line 12, the existing `--warn-bg` line), add:

```css
  --due30: #e67e22;
  --due30-bg: #fdf2e9;
  --due90: #f7dc6f;
  --due90-bg: #fdfaee;
```

(`DUE_60` reuses the existing `--warn`/`--warn-bg`.)

- [ ] **Step 2: Sub-table backgrounds**

Replace (around line 172-174):

```css
.sub-table td.state-EXPIRED { background: var(--expired-bg); }
.sub-table td.state-WARNING { background: var(--warn-bg); }
.sub-table td.state-MISSING { background: var(--missing-bg); }
```

with:

```css
.sub-table td.state-EXPIRED { background: var(--expired-bg); }
.sub-table td.state-DUE_30 { background: var(--due30-bg); }
.sub-table td.state-DUE_60 { background: var(--warn-bg); }
.sub-table td.state-DUE_90 { background: var(--due90-bg); }
.sub-table td.state-MISSING { background: var(--missing-bg); }
```

- [ ] **Step 3: Row-field backgrounds and swatches**

Replace (around line 229-236):

```css
.row-field.state-EXPIRED { background: var(--expired-bg); }
.state-EXPIRED .swatch, .swatch.state-EXPIRED { background: var(--expired); }

.row-field.state-WARNING { background: var(--warn-bg); }
.state-WARNING .swatch, .swatch.state-WARNING { background: var(--warn); }

.row-field.state-MISSING { background: var(--missing-bg); }
.state-MISSING .swatch, .swatch.state-MISSING { background: var(--missing); }
```

with:

```css
.row-field.state-EXPIRED { background: var(--expired-bg); }
.state-EXPIRED .swatch, .swatch.state-EXPIRED { background: var(--expired); }

.row-field.state-DUE_30 { background: var(--due30-bg); }
.state-DUE_30 .swatch, .swatch.state-DUE_30 { background: var(--due30); }

.row-field.state-DUE_60 { background: var(--warn-bg); }
.state-DUE_60 .swatch, .swatch.state-DUE_60 { background: var(--warn); }

.row-field.state-DUE_90 { background: var(--due90-bg); }
.state-DUE_90 .swatch, .swatch.state-DUE_90 { background: var(--due90); }

.row-field.state-MISSING { background: var(--missing-bg); }
.state-MISSING .swatch, .swatch.state-MISSING { background: var(--missing); }
```

- [ ] **Step 4: Issue-row border colors**

Replace (around line 305-307):

```css
.issue-row.state-EXPIRED { border-left-color: var(--expired); }
.issue-row.state-WARNING { border-left-color: var(--warn); }
.issue-row.state-MISSING { border-left-color: var(--missing); }
```

with:

```css
.issue-row.state-EXPIRED { border-left-color: var(--expired); }
.issue-row.state-DUE_30 { border-left-color: var(--due30); }
.issue-row.state-DUE_60 { border-left-color: var(--warn); }
.issue-row.state-DUE_90 { border-left-color: var(--due90); }
.issue-row.state-MISSING { border-left-color: var(--missing); }
```

- [ ] **Step 5: Manual verification**

Open a document with fields expiring at different windows (or temporarily edit a date field to fall in each bucket and save). Confirm each row/table-cell/issue-row is colored per its tier (expired=red, due30=dark orange, due60=yellow/orange existing warn color, due90=light yellow).

- [ ] **Step 6: Commit**

```bash
git add static/style.css
git commit -m "Add CSS colors for DUE_30/DUE_60/DUE_90 expiry tiers"
```

---

### Task 7: `app.py` + `q88/parser.py` - date-field detection and dd-mmm-yyyy display normalization

**Files:**
- Modify: `app.py:431-448` (`classify_cell` in `open_file`)
- Modify: `app.py:462-487` (field/table row-building loop in `open_file`)

**Interfaces:**
- Consumes: `rules.try_parse_date(text) -> datetime.date | None` (existing), `rules.format_date(d) -> str` (Task 1).
- Produces: every field/table-cell dict passed to `document.html` gains two new keys: `is_date` (bool) and `date_iso` (`"yyyy-mm-dd"` string or `""`). `text` is rewritten to `rules.format_date(parsed)` whenever `is_date` is `True`.

Detection is content-based: any cell whose stripped text parses via `rules.try_parse_date()` is a date field, regardless of its expiry/historical/OK classification.

- [ ] **Step 1: Extend `classify_cell` to attach date metadata**

In `app.py`, replace `classify_cell` (around lines 431-448):

```python
    def classify_cell(cell_rec, label, column_header, item_code, collect=True):
        computed_state, _ = rules.classify(
            label, column_header, cell_rec["text"], today=today,
        )
        na_checked = bool(st["na_flags"].get(cell_rec["id"]))
        display_state = "OK" if (na_checked and computed_state in rules.HIGHLIGHTABLE) else computed_state
        cell_rec["display_state"] = display_state
        cell_rec["na_checked"] = na_checked
        cell_rec["show_na_checkbox"] = computed_state in rules.HIGHLIGHTABLE
        cell_rec["recently_changed"] = cell_rec["id"] in recently_changed
        if collect and display_state in rules.HIGHLIGHTABLE:
            full_label = f"{label} ({column_header})" if column_header else label
            issues.append({
                "id": cell_rec["id"], "item_code": item_code,
                "label": full_label, "text": cell_rec["text"], "state": display_state,
            })
        return display_state
```

with:

```python
    def classify_cell(cell_rec, label, column_header, item_code, collect=True):
        computed_state, _ = rules.classify(
            label, column_header, cell_rec["text"], today=today,
        )
        parsed_date = rules.try_parse_date(cell_rec["text"])
        cell_rec["is_date"] = parsed_date is not None
        cell_rec["date_iso"] = parsed_date.isoformat() if parsed_date else ""
        if parsed_date is not None:
            cell_rec["text"] = rules.format_date(parsed_date)

        na_checked = bool(st["na_flags"].get(cell_rec["id"]))
        display_state = "OK" if (na_checked and computed_state in rules.HIGHLIGHTABLE) else computed_state
        cell_rec["display_state"] = display_state
        cell_rec["na_checked"] = na_checked
        cell_rec["show_na_checkbox"] = computed_state in rules.HIGHLIGHTABLE
        cell_rec["recently_changed"] = cell_rec["id"] in recently_changed
        if collect and display_state in rules.HIGHLIGHTABLE:
            full_label = f"{label} ({column_header})" if column_header else label
            issues.append({
                "id": cell_rec["id"], "item_code": item_code,
                "label": full_label, "text": cell_rec["text"], "state": display_state,
            })
        return display_state
```

Note: `classify_cell` mutates `cell_rec["text"]` *before* computing `display_state`/appending to `issues`, so the issues panel shows the normalized dd-mmm-yyyy text too - consistent with what's now in the `<input>`.

- [ ] **Step 2: Verify the field/table loop passes dicts by reference**

Read `app.py` around lines 462-487 (the `for r in ext.display_rows:` loop) and confirm `row = dict(r)` (field case) and `trc["cells"] = [dict(c) for c in tr["cells"]]` (table case) are passed into `classify_cell(row, ...)` / `classify_cell(c, ...)` where `c` is an element of `trc["cells"]` - so mutations inside `classify_cell` land on the dicts already appended to `rows`. No code change needed here if this holds (it does, per the existing structure) - this step is a read-only confirmation, not an edit.

- [ ] **Step 3: Syntax check**

Run: `python -m py_compile app.py`
Expected: no output, exit code 0.

- [ ] **Step 4: Manual verification**

Open a document that has a date-like value in a text field. In a Python shell or by adding a temporary print, confirm `is_date=True` and `date_iso` is a valid `yyyy-mm-dd` string for that field once Task 8 renders it (full visual confirmation happens after Task 8's template change - this step is about confirming no crash / correct dict shape via `python -m py_compile` and eyeballing the diff).

- [ ] **Step 5: Commit**

```bash
git add app.py
git commit -m "Detect date fields and normalize their display text to dd-mmm-yyyy"
```

---

### Task 8: `templates/document.html` - render date fields as `<input type="date">`

**Files:**
- Modify: `templates/document.html:92-94` (field value cell)
- Modify: `templates/document.html:128-130` (table cell value)

**Interfaces:**
- Consumes: `row.is_date`, `row.date_iso`, `row.text` and `c.is_date`, `c.date_iso`, `c.text` from Task 7.

- [ ] **Step 1: Update the field value input**

Replace (around line 92-94):

```html
                <td class="value">
                  <input type="text" name="f_{{ row.id }}" value="{{ row.text }}" {{ 'disabled' if read_only }}>
                </td>
```

with:

```html
                <td class="value">
                  {% if row.is_date %}
                    <input type="date" name="f_{{ row.id }}" value="{{ row.date_iso }}" {{ 'disabled' if read_only }}>
                  {% else %}
                    <input type="text" name="f_{{ row.id }}" value="{{ row.text }}" {{ 'disabled' if read_only }}>
                  {% endif %}
                </td>
```

- [ ] **Step 2: Update the table cell input**

Replace (around line 128-130):

```html
                            <td class="state-{{ c.display_state }} {{ 'recently-changed' if c.recently_changed }}" id="field-{{ c.id }}">
                              <input type="text" name="f_{{ c.id }}" value="{{ c.text }}" {{ 'disabled' if read_only }}>
```

with:

```html
                            <td class="state-{{ c.display_state }} {{ 'recently-changed' if c.recently_changed }}" id="field-{{ c.id }}">
                              {% if c.is_date %}
                                <input type="date" name="f_{{ c.id }}" value="{{ c.date_iso }}" {{ 'disabled' if read_only }}>
                              {% else %}
                                <input type="text" name="f_{{ c.id }}" value="{{ c.text }}" {{ 'disabled' if read_only }}>
                              {% endif %}
```

- [ ] **Step 3: Manual verification**

Open a document with at least one date-parseable field. Confirm that field now shows a native date picker (calendar icon), pre-filled with the correct date. Confirm non-date fields are unaffected (still plain text inputs). Click the calendar icon, pick a different date, hit Save, and confirm the saved value round-trips as dd-mmm-yyyy on next `/open` (verified fully once Task 9 handles the submit-side conversion - if Task 9 isn't done yet, the submitted ISO string will land in the .docx unconverted; do this verification after Task 9 instead, or note the temporary gap).

- [ ] **Step 4: Commit**

```bash
git add templates/document.html
git commit -m "Render detected date fields as native <input type=date>"
```

---

### Task 9: `app.py` - convert submitted ISO dates back to dd-mmm-yyyy on save

**Files:**
- Modify: `app.py:677-706` (`_apply_form_edits`)
- Modify: `app.py:553-578` (`field_edit` route)

**Interfaces:**
- Consumes: `rules.normalize_incoming_date(raw) -> str` from Task 2.

- [ ] **Step 1: Update `_apply_form_edits`**

In `app.py`, inside `_apply_form_edits` (around line 685-691), replace:

```python
    for fid, cell in ext.cell_map.items():
        new_text = form.get(f"f_{fid}")
        if new_text is None:
            continue
        old_text = cell.text.strip()
        new_text = new_text.strip()
        if new_text != old_text:
```

with:

```python
    for fid, cell in ext.cell_map.items():
        new_text = form.get(f"f_{fid}")
        if new_text is None:
            continue
        old_text = cell.text.strip()
        new_text = rules.normalize_incoming_date(new_text.strip())
        if new_text != old_text:
```

- [ ] **Step 2: Update `field_edit`**

In `app.py`, inside `field_edit` (around line 565), replace:

```python
    new_text = (request.form.get("text") or "").strip()
```

with:

```python
    new_text = rules.normalize_incoming_date((request.form.get("text") or "").strip())
```

- [ ] **Step 3: Syntax check**

Run: `python -m py_compile app.py`
Expected: no output, exit code 0.

- [ ] **Step 4: Manual verification**

Open a document, use a date picker to pick a new date on a date field, hit Save. Confirm: the saved `.docx` cell (re-open the file, or check via `python -c "import docx; d=docx.Document('path'); ..."`) contains dd-mmm-yyyy text, not `yyyy-mm-dd`. Confirm edit history (History page) shows the change with the new dd-mmm-yyyy value, not the raw ISO string.

- [ ] **Step 5: Commit**

```bash
git add app.py
git commit -m "Convert date-input ISO submissions to dd-mmm-yyyy before writing to .docx"
```

---

### Task 10: `static/app.js` - track date inputs as dirty

**Files:**
- Modify: `static/app.js:110-115`

**Interfaces:**
- Consumes: none new: this only widens an existing `matches()` selector.

- [ ] **Step 1: Update the dirty-tracking selector**

In `static/app.js`, replace (around line 111-114):

```javascript
    form.addEventListener("input", function (e) {
      if (e.target.matches('input[type="text"], input[type="checkbox"]')) {
        dirty = true;
      }
    });
```

with:

```javascript
    form.addEventListener("input", function (e) {
      if (e.target.matches('input[type="text"], input[type="date"], input[type="checkbox"]')) {
        dirty = true;
      }
    });
```

- [ ] **Step 2: Manual verification**

Open a document, change a date field via the picker, then try to navigate away (e.g. click "Files" link) without saving - confirm the browser shows the "leave site / unsaved changes" prompt (`beforeunload`).

- [ ] **Step 3: Commit**

```bash
git add static/app.js
git commit -m "Track date-input changes for the unsaved-changes warning"
```

---

### Task 11: `app.py` - home page severity summary (`_quick_scan`)

**Files:**
- Modify: `app.py:150-233` (`_compute_issues`, `_quick_scan`)

**Interfaces:**
- Consumes: `_compute_issues(path, ext=None) -> list[dict]` (each dict has `"state"`) from Task 4.
- Produces: `_quick_scan(path)` result dict gains two keys: `"worst_state"` (one of `"EXPIRED"`, `"DUE_30"`, `"DUE_60"`, `"DUE_90"`, `"MISSING"`, or `None` if no issues) and `"worst_count"` (int - how many issues share that worst state). Existing `"issue_count"` key is unchanged.

- [ ] **Step 1: Add a severity-summary helper**

In `app.py`, add a new function right after `_compute_issues` (around line 195, before `_quick_scan`):

```python
def _severity_summary(issues):
    """Given the list from _compute_issues, return (worst_state, worst_count) -
    the single most severe tier present and how many issues share it, or
    (None, 0) if there are no issues. Severity order matches state_order
    elsewhere: EXPIRED is worse than DUE_30, which is worse than MISSING."""
    tier_rank = {"EXPIRED": 0, "DUE_30": 1, "DUE_60": 2, "DUE_90": 3, "MISSING": 4}
    if not issues:
        return None, 0
    worst_state = min((i["state"] for i in issues), key=lambda s: tier_rank.get(s, 9))
    worst_count = sum(1 for i in issues if i["state"] == worst_state)
    return worst_state, worst_count
```

- [ ] **Step 2: Wire it into `_quick_scan`**

In `app.py`, inside `_quick_scan` (around line 213-225), replace:

```python
    try:
        ext = parser.extract(docx.Document(path))
        issue_count = len(_compute_issues(path, ext=ext))
        vessel_name = ""
        flag = ""
        for r in ext.display_rows:
            if r["type"] != "field":
                continue
            if r["item_code"] == "1.2":
                vessel_name = ext.cell_map[r["id"]].text.strip()
            elif r["item_code"] == "1.5":
                flag = ext.cell_map[r["id"]].text.strip()
        result = {"issue_count": issue_count, "vessel_name": vessel_name, "flag": flag}
    except Exception:
        return None
```

with:

```python
    try:
        ext = parser.extract(docx.Document(path))
        issues = _compute_issues(path, ext=ext)
        worst_state, worst_count = _severity_summary(issues)
        vessel_name = ""
        flag = ""
        for r in ext.display_rows:
            if r["type"] != "field":
                continue
            if r["item_code"] == "1.2":
                vessel_name = ext.cell_map[r["id"]].text.strip()
            elif r["item_code"] == "1.5":
                flag = ext.cell_map[r["id"]].text.strip()
        result = {
            "issue_count": len(issues), "vessel_name": vessel_name, "flag": flag,
            "worst_state": worst_state, "worst_count": worst_count,
        }
    except Exception:
        return None
```

- [ ] **Step 3: Wire it into the `index()` route**

In `app.py`, inside `index()` (around line 264-269), replace:

```python
    for f in files:
        scan = _quick_scan(os.path.join(folder, f["name"])) if f["supported"] else None
        f["issue_count"] = scan["issue_count"] if scan else None
        f["vessel_name"] = scan["vessel_name"] if scan else ""
        f["flag"] = scan["flag"] if scan else ""
```

with:

```python
    for f in files:
        scan = _quick_scan(os.path.join(folder, f["name"])) if f["supported"] else None
        f["issue_count"] = scan["issue_count"] if scan else None
        f["vessel_name"] = scan["vessel_name"] if scan else ""
        f["flag"] = scan["flag"] if scan else ""
        f["worst_state"] = scan["worst_state"] if scan else None
        f["worst_count"] = scan["worst_count"] if scan else 0
```

- [ ] **Step 4: Add an aggregate summary for the banner**

Still inside `index()`, right after the `for f in files:` loop, add:

```python
    tier_totals = {"EXPIRED": 0, "DUE_30": 0, "DUE_60": 0, "DUE_90": 0}
    for f in files:
        if f.get("worst_state") in tier_totals:
            tier_totals[f["worst_state"]] += 1
```

Then add `tier_totals=tier_totals,` to the `render_template("index.html", ...)` call.

- [ ] **Step 5: Syntax check**

Run: `python -m py_compile app.py`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add app.py
git commit -m "Compute worst-tier severity summary for home page file cards"
```

---

### Task 12: `templates/index.html` + `static/style.css` - home page card highlighting and banner

**Files:**
- Modify: `templates/index.html:26-58` (file card loop)
- Modify: `templates/index.html:15-20` (insert banner above the file list)
- Modify: `static/style.css:436-440` (`.file-tag` rules)

**Interfaces:**
- Consumes: `f.worst_state`, `f.worst_count`, `f.issue_count` (Task 11); `tier_totals` dict (Task 11).

- [ ] **Step 1: Add the severity banner**

In `templates/index.html`, right after the `<h2>Vessel files</h2>` panel-header block and before the `<input ... id="file-search" ...>` line (around line 19-20), insert:

```html
      {% set has_urgent = tier_totals.EXPIRED or tier_totals.DUE_30 or tier_totals.DUE_60 or tier_totals.DUE_90 %}
      {% if has_urgent %}
        <div class="severity-banner">
          {% if tier_totals.EXPIRED %}<span class="severity-chip state-EXPIRED">{{ tier_totals.EXPIRED }} file(s) expired</span>{% endif %}
          {% if tier_totals.DUE_30 %}<span class="severity-chip state-DUE_30">{{ tier_totals.DUE_30 }} file(s) due &lt;=30d</span>{% endif %}
          {% if tier_totals.DUE_60 %}<span class="severity-chip state-DUE_60">{{ tier_totals.DUE_60 }} file(s) due &lt;=60d</span>{% endif %}
          {% if tier_totals.DUE_90 %}<span class="severity-chip state-DUE_90">{{ tier_totals.DUE_90 }} file(s) due &lt;=90d</span>{% endif %}
        </div>
      {% endif %}
```

- [ ] **Step 2: Give the file card a severity attribute and tiered badge text**

Replace the `<li>` opening tag (around line 27-29):

```html
          <li class="{{ 'file-card' if f.supported else 'file-card disabled' }}"
              data-mtime="{{ f.mtime }}"
              {% if f.supported %}data-filename="{{ f.name }}"{% endif %}>
```

with:

```html
          <li class="{{ 'file-card' if f.supported else 'file-card disabled' }}"
              data-mtime="{{ f.mtime }}"
              {% if f.worst_state %}data-severity="{{ f.worst_state }}"{% endif %}
              {% if f.supported %}data-filename="{{ f.name }}"{% endif %}>
```

Replace the issue-count badge block (around line 40-44):

```html
                    {% if f.issue_count %}
                      <span class="file-tag issues">{{ f.issue_count }} issue{{ 's' if f.issue_count != 1 }}</span>
                    {% elif f.issue_count == 0 %}
                      <span class="file-tag clean">No issues</span>
                    {% endif %}
```

with:

```html
                    {% if f.worst_state == 'EXPIRED' %}
                      <span class="file-tag state-EXPIRED">{{ f.worst_count }} expired</span>
                    {% elif f.worst_state == 'DUE_30' %}
                      <span class="file-tag state-DUE_30">{{ f.worst_count }} due &lt;=30d</span>
                    {% elif f.worst_state == 'DUE_60' %}
                      <span class="file-tag state-DUE_60">{{ f.worst_count }} due &lt;=60d</span>
                    {% elif f.worst_state == 'DUE_90' %}
                      <span class="file-tag state-DUE_90">{{ f.worst_count }} due &lt;=90d</span>
                    {% elif f.issue_count %}
                      <span class="file-tag issues">{{ f.issue_count }} issue{{ 's' if f.issue_count != 1 }}</span>
                    {% elif f.issue_count == 0 %}
                      <span class="file-tag clean">No issues</span>
                    {% endif %}
```

- [ ] **Step 3: Add CSS for the card border and banner**

In `static/style.css`, right after the existing `.file-tag.clean { ... }` rule (around line 440), add:

```css
.file-card[data-severity="EXPIRED"] { border-left: 4px solid var(--expired); background: var(--expired-bg); }
.file-card[data-severity="DUE_30"] { border-left: 4px solid var(--due30); background: var(--due30-bg); }
.file-card[data-severity="DUE_60"] { border-left: 4px solid var(--warn); background: var(--warn-bg); }
.file-card[data-severity="DUE_90"] { border-left: 4px solid var(--due90); background: var(--due90-bg); }

.file-tag.state-EXPIRED { background: var(--expired-bg); color: #7a1f1f; }
.file-tag.state-DUE_30 { background: var(--due30-bg); color: #7a3d00; }
.file-tag.state-DUE_60 { background: var(--warn-bg); color: #6b5100; }
.file-tag.state-DUE_90 { background: var(--due90-bg); color: #6b5100; }

.severity-banner { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.severity-chip { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 4px; }
.severity-chip.state-EXPIRED { background: var(--expired-bg); color: #7a1f1f; }
.severity-chip.state-DUE_30 { background: var(--due30-bg); color: #7a3d00; }
.severity-chip.state-DUE_60 { background: var(--warn-bg); color: #6b5100; }
.severity-chip.state-DUE_90 { background: var(--due90-bg); color: #6b5100; }
```

- [ ] **Step 4: Manual verification**

Open the home page with a folder containing at least one file with an expired item and one with a <=30-day item (temporarily edit a date field and save if needed). Confirm: the summary banner appears above the file list with correct counts; the affected file cards show a colored left border and a tiered badge (e.g. "2 expired", "1 due <=30d") instead of the generic "N issues"; files with only MISSING issues still show the generic badge; files with no issues still show "No issues"; unsupported `.doc` files are unaffected.

- [ ] **Step 5: Commit**

```bash
git add templates/index.html static/style.css
git commit -m "Highlight expired/soon-expiring files on the home page"
```

---

### Task 13: Full regression pass

**Files:** none (verification only)

**Interfaces:** none new.

- [ ] **Step 1: Run the full unit test suite**

Run: `python -m pytest tests/ -v`
Expected: all tests pass (13 from Tasks 1-3).

- [ ] **Step 2: Syntax-check the whole app**

Run: `python -m py_compile app.py q88/parser.py q88/rules.py q88/state.py q88/style.py q88/locks.py q88/config.py`
Expected: no output, exit code 0.

- [ ] **Step 3: Manual end-to-end pass**

Start the server, then in a browser:
1. Open a document, confirm all previously-free-text date fields now show calendar pickers pre-filled with the correct date, formatted dd-mmm-yyyy once saved.
2. Edit a date to fall within 25 days from today, save, confirm the field/table cell/issues panel show it as `DUE_30` (dark orange).
3. Edit a date to be in the past, save, confirm `EXPIRED` (red).
4. Go to History, confirm the edit shows the new dd-mmm-yyyy value.
5. Go to the home page, confirm that file's card shows a colored border and tiered badge, and the summary banner reflects it.
6. Open a second, unrelated file with no date issues - confirm its card is unaffected ("No issues" or generic badge as before).
7. Confirm the "Warn within (days)" control is gone from the document page toolbar and nothing in the browser console errors out.

- [ ] **Step 4: Commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "Fix issues found during regression pass"
```

(Skip this commit if verification found nothing to fix.)

---

## Self-Review Notes

- **Spec coverage:** Section 1 (date detection/normalization) -> Tasks 1, 2, 7, 9. Section 2 (calendar picker) -> Tasks 8, 10. Section 3 (30/60/90 tiers) -> Tasks 3, 4, 5, 6. Section 4 (home page highlighting) -> Tasks 11, 12. All covered.
- **Placeholder scan:** none found - every step has literal code/commands.
- **Type consistency:** `rules.classify()` signature (`label, column_header, text, today=None`) is identical across Tasks 3, 4, 7. `rules.format_date(d)` / `rules.normalize_incoming_date(raw)` signatures match between definition (Tasks 1-2) and call sites (Tasks 7, 9). `is_date`/`date_iso` keys introduced in Task 7 match exactly what Task 8's template reads. `worst_state`/`worst_count` keys introduced in Task 11 match what Task 12's template reads.
- **`requirements-dev.txt` note:** Task 1 references creating this file for `pytest` - it doesn't exist yet in the repo. This is a one-line file (`pytest`), not tracked as its own task since it's only needed to run the test suite locally, not to run the app.
