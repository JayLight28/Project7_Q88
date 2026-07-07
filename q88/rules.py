import re
import datetime
from dateutil import parser as dateparser

NA_VALUES = {
    "NA", "N/A", "N.A.", "N.A", "-", "NOT APPLICABLE", "NONE", "N / A", "N-A",
}

DATE_HINT_RE = re.compile(
    r"(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})"
    r"|(\d{1,2}\s*[-/. ]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/. ,]?\s*\d{2,4})"
    r"|((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})",
    re.I,
)

EXPIRY_KEYWORDS = ["expir", "due", "renewal", "renewed", "valid until", "next "]
HISTORICAL_KEYWORDS = [
    "last ", "issued", "installed", "delivered", "date updated",
    "previous name", "built", "date/place of last",
]

STATE_OK = "OK"
STATE_MISSING = "MISSING"
STATE_NA = "NOT_APPLICABLE"
STATE_EXPIRED = "EXPIRED"
STATE_DUE_30 = "DUE_30"
STATE_DUE_60 = "DUE_60"
STATE_DUE_90 = "DUE_90"
STATE_HISTORICAL = "HISTORICAL"

HIGHLIGHTABLE = {STATE_MISSING, STATE_EXPIRED, STATE_DUE_30, STATE_DUE_60, STATE_DUE_90}

MONTH_ABBR = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def format_date(d):
    """dd-mmm-yyyy, locale-independent (never relies on strftime('%b'),
    which can render non-English month names on a non-English Windows box)."""
    return f"{d.day:02d}-{MONTH_ABBR[d.month - 1]}-{d.year:04d}"


ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def normalize_newlines(text):
    """Form submissions arrive with CRLF line endings; docx cell text uses
    bare \\n. Every write path must normalize identically or multiline cells
    stop round-tripping (phantom diffs, squashed lines)."""
    return (text or "").replace("\r\n", "\n").replace("\r", "\n")


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


DATE_ONLY_RE = re.compile(
    r"^(\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4})$"
    r"|^(\d{1,2}\s*[-/. ]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/. ,]?\s*\d{2,4})$"
    r"|^((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})$",
    re.I,
)


def try_parse_pure_date(text):
    """Like try_parse_date, but only succeeds when the ENTIRE stripped cell
    text is a date - not a date embedded in a longer sentence or a compound
    "date / place" field (e.g. "01 July 2024 / Taichung (Taiwan)"). Used to
    decide whether to render a calendar picker, since overwriting a compound
    field's text with just the date portion would destroy the other content."""
    t = (text or "").strip()
    if not DATE_ONLY_RE.match(t):
        return None
    return try_parse_date(t)


def _normalize_na(text):
    return text.strip().upper().replace(" ", "")


def try_parse_date(text):
    if not DATE_HINT_RE.search(text):
        return None
    try:
        # dayfirst: ambiguous numeric dates in these forms are day-first
        # ("01.10.2021" = 01 Oct) - the default US order silently flipped
        # them to "10-Jan-2021" when a save normalized the format
        dt = dateparser.parse(text, fuzzy=True, dayfirst=True, default=datetime.datetime(2000, 1, 1))
        return dt.date()
    except (ValueError, OverflowError):
        return None


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
