import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from q88 import locks


def setup_function(_fn):
    locks._locks.clear()


def _expire(filename):
    locks._locks[filename]["since"] = time.time() - locks.LOCK_TIMEOUT_SECONDS - 1


def test_first_acquire_succeeds():
    ok, holder, resumed = locks.acquire("f", "a", "Alice")
    assert ok is True
    assert holder is None
    assert resumed is True  # no prior entry -> not a plain refresh


def test_refresh_of_live_own_lock_is_not_resumed():
    locks.acquire("f", "a", "Alice")
    ok, holder, resumed = locks.acquire("f", "a", "Alice")
    assert ok is True
    assert resumed is False


def test_other_client_blocked_while_live():
    locks.acquire("f", "a", "Alice")
    ok, holder, resumed = locks.acquire("f", "b", "Bob")
    assert ok is False
    assert holder["name"] == "Alice"
    assert resumed is False


def test_reacquire_after_own_lock_expired_is_resumed():
    locks.acquire("f", "a", "Alice")
    _expire("f")
    ok, _, resumed = locks.acquire("f", "a", "Alice")
    assert ok is True
    assert resumed is True


def test_takeover_of_expired_other_holder_is_resumed():
    locks.acquire("f", "a", "Alice")
    _expire("f")
    ok, _, resumed = locks.acquire("f", "b", "Bob")
    assert ok is True
    assert resumed is True


def test_release_ignores_non_owner():
    locks.acquire("f", "a", "Alice")
    locks.release("f", "b")
    assert locks.status("f")["name"] == "Alice"


def test_release_by_owner_frees_lock():
    locks.acquire("f", "a", "Alice")
    locks.release("f", "a")
    assert locks.status("f") is None


def test_status_drops_expired_entry():
    locks.acquire("f", "a", "Alice")
    _expire("f")
    assert locks.status("f") is None


def test_is_owner_true_for_holder_and_free_lock():
    assert locks.is_owner("f", "a") is True  # nobody holds it
    locks.acquire("f", "a", "Alice")
    assert locks.is_owner("f", "a") is True
    assert locks.is_owner("f", "b") is False
    _expire("f")
    assert locks.is_owner("f", "b") is True  # expired counts as free
