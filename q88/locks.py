"""In-memory per-file edit locks so two colleagues can't silently overwrite
each other's changes to the same vessel file. A lock is held by whoever last
acquired/refreshed it and expires automatically if their page goes away
without releasing it (closed tab, crash, network drop)."""
import threading
import time

LOCK_TIMEOUT_SECONDS = 180

_mutex = threading.Lock()
_locks = {}  # filename -> {"client_id", "name", "since"}


def _expired(entry):
    return (time.time() - entry["since"]) > LOCK_TIMEOUT_SECONDS


def status(filename):
    """Return the current holder dict if locked by someone (non-expired), else None."""
    with _mutex:
        entry = _locks.get(filename)
        if entry and _expired(entry):
            del _locks[filename]
            entry = None
        return dict(entry) if entry else None


def acquire(filename, client_id, name):
    """Try to take/refresh the lock for client_id. Returns (ok, holder_if_blocked,
    resumed). resumed is True when this was NOT a plain refresh of the caller's
    own live lock (no entry, an expired one, or a takeover from an expired other
    holder) - the heartbeat surfaces that to the user, since someone else may
    have edited the file during the gap."""
    with _mutex:
        entry = _locks.get(filename)
        if entry and not _expired(entry) and entry["client_id"] != client_id:
            return False, dict(entry), False
        resumed = entry is None or _expired(entry) or entry["client_id"] != client_id
        _locks[filename] = {"client_id": client_id, "name": name, "since": time.time()}
        return True, None, resumed


def release(filename, client_id):
    with _mutex:
        entry = _locks.get(filename)
        if entry and entry["client_id"] == client_id:
            del _locks[filename]


def is_owner(filename, client_id):
    with _mutex:
        entry = _locks.get(filename)
        if not entry or _expired(entry):
            return True  # nobody holds it (or it expired) - treat as free to take
        return entry["client_id"] == client_id
