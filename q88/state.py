import json
import os
import shutil
import datetime

SUPPORT_DIRNAME = "_q88_backups"


def _support_dir(docx_path):
    d = os.path.join(os.path.dirname(docx_path), SUPPORT_DIRNAME)
    os.makedirs(d, exist_ok=True)
    return d


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
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def ensure_backup(docx_path):
    bpath = backup_path(docx_path)
    if not os.path.exists(bpath):
        shutil.copy2(docx_path, bpath)


def record_edit(state, field_id, label, old_text, new_text, by="Anonymous"):
    state["history"].append({
        "ts": datetime.datetime.now().isoformat(timespec="seconds"),
        "by": by,
        "field_id": field_id,
        "label": label,
        "old": old_text,
        "new": new_text,
    })
