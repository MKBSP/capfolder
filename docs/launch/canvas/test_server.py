"""Run: python3 docs/launch/canvas/test_server.py — checks saves can't clobber newer files."""
import json, os, tempfile, threading, urllib.request
from pathlib import Path

root = Path(tempfile.mkdtemp())
os.environ["CANVAS_ROOT"] = str(root)
(root / "docs/launch/posts/a").mkdir(parents=True)
(root / "docs/launch/posts/a/posts.json").write_text('{"posts": []}')

import server  # noqa: E402  (reads CANVAS_ROOT on import)

srv = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_port}"


def call(method, path, body=b"", headers={}):
    try:
        with urllib.request.urlopen(urllib.request.Request(base + path, body, headers, method=method)) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None


code, blogs = call("GET", "/api/blogs")
assert code == 200 and blogs[0]["id"] == "a"
v = blogs[0]["version"]
assert call("PUT", "/api/blogs/a", b'{"posts": [1]}', {"If-Match": "stale"})[0] == 409
code, out = call("PUT", "/api/blogs/a", b'{"posts": [1]}', {"If-Match": v})
assert code == 200 and json.loads((root / "docs/launch/posts/a/posts.json").read_text()) == {"posts": [1]}
assert call("PUT", "/api/blogs/a", b'{"posts": [2]}', {"If-Match": v})[0] == 409  # old version again
assert call("PUT", "/api/blogs/..", b"{}", {"If-Match": "0"})[0] == 400
assert call("POST", "/api/media/a?name=x.exe", b"MZ")[0] == 400
code, out = call("POST", "/api/media/a?name=../../pic.png", b"png")
assert code == 200 and (root / "docs/launch/posts/a" / out["file"]).read_bytes() == b"png" and ".." not in out["file"]
print("ok")
