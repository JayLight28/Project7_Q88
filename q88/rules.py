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
STATE_WARNING = "WARNING"
STATE_HISTORICAL = "HISTORICAL"

HIGHLIGHTABLE = {STATE_MISSING, STATE_EXPIRED, STATE_WARNING}


def _normalize_na(text):
    return text.strip().upper().replace(" ", "")


def try_parse_date(text):
    if not DATE_HINT_RE.search(text):
        return None
    try:
        dt = dateparser.parse(text, fuzzy=True, default=datetime.datetime(2000, 1, 1))
        return dt.date()
    except (ValueError, OverflowError):
        return None


def classify(label, column_header, text, warning_days=60, today=None):
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
    if delta_days <= warning_days:
        return STATE_WARNING, parsed
    return STATE_OK, parsed
