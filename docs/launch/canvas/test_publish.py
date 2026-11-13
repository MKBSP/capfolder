"""Run: python3 docs/launch/canvas/test_publish.py — checks which posts auto-publish when."""
import json, os, tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

root = Path(tempfile.mkdtemp())
os.environ["CANVAS_ROOT"] = str(root)
(root / "docs/launch/posts/a").mkdir(parents=True)
(root / "docs/launch/channels.json").write_text(json.dumps([
    {"id": "dd-open", "access": "post"}, {"id": "dd-mod", "access": "approval"}, {"id": "dd-closed", "access": "no"}]))
post = lambda id, **k: {"id": id, "channel": "dd-mod", "status": "todo", "when": "2026-11-11T15:00", "auto": True, "title": "t", "text": "x", **k}
f = root / "docs/launch/posts/a/posts.json"
f.write_text(json.dumps({"tz": "Europe/Lisbon", "posts": [
    post("due"), post("off", auto=False), post("done", status="posted"), post("later", when="2026-11-11T16:00", channel="indiehackers"),
    post("stale", when="2026-11-11T08:00"), post("failed", autoError="x"), post("manual", channel="hn"),
    post("closed", channel="dd-closed"), post("ih", channel="indiehackers"),
    post("ahead", channel="dd-open", when="2026-11-20T15:00"), post("modlater", when="2026-11-20T15:00"), post("untitled", channel="dd-open", when="2026-11-20T15:00", title=""),
    post("offline", retryAt="2999-01-01T00:00:00+00:00"), post("retried", channel="indiehackers", retryAt="2000-01-01T00:00:00+00:00"),
    post("article", channel="substack", when="2026-11-17T09:00"), post("note", channel="substack-notes", when="2026-11-17T10:00"),
]}))

import publish  # noqa: E402  (reads CANVAS_ROOT on import)

now = datetime(2026, 11, 11, 15, 30, tzinfo=ZoneInfo("Europe/Lisbon"))
os.utime(f, (now.timestamp() - 3600,) * 2)  # file untouched for an hour
assert publish.due(now) == [("a", "due"), ("a", "ih"), ("a", "ahead"), ("a", "retried"), ("a", "article")], publish.due(now)
os.utime(f, (now.timestamp() - 60,) * 2)  # just edited: nothing is scheduled ahead yet
assert publish.due(now) == [("a", "due"), ("a", "ih"), ("a", "retried")], publish.due(now)
print("ok")
