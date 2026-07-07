import json
import os
import shutil
import datetime

SUPPORT_DIRNAME = "_q88_backups"


def _support_dir(docx_path):
    """Pure path computation - directory creation happens only in the write
    paths (save_state/ensure_backup). Read paths (load_state, existence
    checks, cache keys) must not touch the share."""
    return os.path.join(os.path.dirname(docx_path), SUPPORT_DIRNAME)


def state_path(docx_path):
    return os.path.join(_support_dir(docx_path), os.path.basename(docx_path) + ".q88state.json")


def backup_path(docx_path):
    base, ext = os.path.splitext(os.path.basename(docx_path))
    return os.path.join(_support_dir(docx_path), f"{base}.original_backup{ext}")


def load_state(docx_path):
    path = state_path(docx_path)
    if not os.path.exists(path):
        return {"na_flags": {}, "history": []}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(docx_path, state):
    path = state_path(docx_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def ensure_backup(docx_path):
    bpath = backup_path(docx_path)
    if not os.path.exists(bpath):
        os.makedirs(os.path.dirname(bpath), exist_ok=True)
        shutil.copy2(docx_path, bpath)


def move_sidecars(old_docx_path, new_docx_path):
    """Move the state/backup sidecars when their .docx is renamed. os.replace,
    not os.rename: a leftover sidecar from an earlier incarnation of the
    target name must lose to the live file's sidecars, not crash the save."""
    for pathfn in (state_path, backup_path):
        old = pathfn(old_docx_path)
        if os.path.exists(old):
            os.replace(old, pathfn(new_docx_path))


def record_edit(state, field_id, label, old_text, new_text, by="Anonymous"):
    state["history"].append({
        "ts": datetime.datetime.now().isoformat(timespec="seconds"),
        "by": by,
        "field_id": field_id,
        "label": label,
        "old": old_text,
        "new": new_text,
    })
