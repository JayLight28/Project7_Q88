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


def test_normalize_incoming_date_converts_iso():
    assert rules.normalize_incoming_date("2026-07-02") == "02-Jul-2026"


def test_normalize_incoming_date_passes_through_empty():
    assert rules.normalize_incoming_date("") == ""


def test_normalize_incoming_date_passes_through_non_iso():
    assert rules.normalize_incoming_date("02-Jul-2026") == "02-Jul-2026"
    assert rules.normalize_incoming_date("N/A") == "N/A"


def test_normalize_incoming_date_passes_through_invalid_iso_shape():
    assert rules.normalize_incoming_date("2026-13-99") == "2026-13-99"


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


def test_try_parse_pure_date_accepts_plain_date():
    assert rules.try_parse_pure_date("20-Jul-2026") == datetime.date(2026, 7, 20)
    assert rules.try_parse_pure_date("Feb 20, 2027") == datetime.date(2027, 2, 20)
    assert rules.try_parse_pure_date("01 July 2026") == datetime.date(2026, 7, 1)


def test_try_parse_pure_date_rejects_date_plus_place():
    assert rules.try_parse_pure_date("01 July 2024 / Taichung (Taiwan)") is None


def test_try_parse_pure_date_rejects_date_embedded_in_sentence():
    assert rules.try_parse_pure_date("as it is not a new ship as define in regulation 2.2.18") is None


def test_try_parse_pure_date_rejects_name_plus_date():
    assert rules.try_parse_pure_date("WOO TAE (Sep 16, 2019)") is None
