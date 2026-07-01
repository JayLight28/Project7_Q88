import json
import os

_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app_config.json")
_CONFIG_PATH = os.path.normpath(_CONFIG_PATH)

_DEFAULT_FOLDER = os.path.normpath(os.path.join(os.path.dirname(_CONFIG_PATH)))


def _load():
    if not os.path.exists(_CONFIG_PATH):
        return {}
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save(cfg):
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def get_watch_folder():
    cfg = _load()
    folder = cfg.get("watch_folder")
    if folder and os.path.isdir(folder):
        return folder
    return _DEFAULT_FOLDER


def set_watch_folder(folder):
    folder = os.path.normpath(folder)
    if not os.path.isdir(folder):
        raise ValueError(f"Not a folder: {folder}")
    cfg = _load()
    cfg["watch_folder"] = folder
    _save(cfg)
    return folder
