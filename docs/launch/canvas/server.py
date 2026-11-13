"""Launch canvas: one primary post (blog) in the middle, every channel post around it.

Run:  python3 docs/launch/canvas/server.py   then open http://127.0.0.1:8812/

Data lives in docs/launch/posts/<blog>/posts.json (one file per blog), channels in
docs/launch/channels.json. Notes left in the canvas are in each post's "notes" with
"done": false; Claude applies them and ticks them off.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(os.environ.get("CANVAS_ROOT") or Path(__file__).resolve().parents[3])
POSTS = ROOT / "docs/launch/posts"
SLUG = re.compile(r"[a-z0-9][a-z0-9-]*")
MEDIA_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".mov", ".webm"}
MAX_UPLOAD = 15 * 1024 * 1024
PUBLISH = [sys.executable, str(Path(__file__).with_name("publish.py"))]
# One browser at a time: the button and the minute loop must not post the same thing twice.
publishing = threading.Lock()
CLAUDE = shutil.which("claude") or str(Path.home() / ".local/bin/claude")
# Claude may only write inside docs/launch/posts; it reads the article and channels.json.
PLAN_TOOLS = "Read,Glob,Grep,WebFetch,Edit(docs/launch/posts/**),Write(docs/launch/posts/**)"
planning = set()
SITES = ("dailydev", "indiehackers", "substack")
logins = {}  # site -> still logged in? (publish.py logins, every LOGIN_EVERY seconds)
LOGIN_EVERY = 6 * 3600


def publish(*args):
    with publishing:
        r = subprocess.run(PUBLISH + list(args), capture_output=True, text=True, timeout=300)
    lines = r.stdout.strip().splitlines()
    return json.loads(lines[-1]) if lines and lines[-1].startswith("{") else {"error": (r.stderr or r.stdout)[-400:]}


def plan(blog):
    """Claude Code, headless, plans and drafts the posts for one article (see plan.md). Takes a few minutes."""
    if blog in planning:
        return
    planning.add(blog)

    def run():
        try:
            prompt = Path(__file__).with_name("plan.md").read_text() + f"\n\nBLOG = docs/launch/posts/{blog}\nToday is {date.today()}.\n"
            with open(POSTS / blog / "plan.log", "w") as log:
                subprocess.run([CLAUDE, "-p", prompt, "--allowedTools", PLAN_TOOLS], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=1800)
        except Exception as e:
            print("plan:", e)
        finally:
            planning.discard(blog)

    threading.Thread(target=run, daemon=True).start()


def new_articles():
    """A folder dropped into docs/launch/posts with an article (index.html or article.md) and no
    posts.json becomes a blog, and Claude plans its posts."""
    for d in POSTS.iterdir():
        src = next((n for n in ("index.html", "article.md") if (d / n).exists()), None)
        if not (d.is_dir() and src and SLUG.fullmatch(d.name)) or (d / "posts.json").exists():
            continue
        text = (d / src).read_text(errors="ignore")
        m = re.search(r"<title>(.*?)</title>|<h1[^>]*>(.*?)</h1>|^# (.+)$", text, re.S | re.M)
        title = re.sub(r"<[^>]+>|\s+", " ", next(g for g in m.groups() if g) if m else d.name).strip()
        stub = {"title": title, "url": "", "date": str(date.today()), "tz": "Europe/Lisbon", "source": src, "notes": "", "posts": []}
        (d / "posts.json").write_text(json.dumps(stub, indent=2, ensure_ascii=False) + "\n")
        plan(d.name)


def check_logins():
    out = publish("logins")
    if "error" not in out:
        logins.clear()
        logins.update(out)


def new_from_link(url):
    """An article that's already live: a blog folder named after its link, then Claude plans it (it reads the page)."""
    slug = re.sub(r"[^a-z0-9]+", "-", urlparse(url).path.lower()).strip("-").split("-")[-6:]
    name = f"{date.today()}-{'-'.join(slug) or 'article'}"
    d = POSTS / name
    if (d / "posts.json").exists():
        return name
    d.mkdir(parents=True, exist_ok=True)
    stub = {"title": url, "url": url, "date": "", "tz": "Europe/Lisbon", "source": "", "notes": "", "posts": []}
    (d / "posts.json").write_text(json.dumps(stub, indent=2, ensure_ascii=False) + "\n")
    plan(name)
    return name


def auto_loop():
    """Every minute, publish posts marked auto whose time has come (see publish.py due)."""
    last_login = 0
    while True:
        if time.time() - last_login > LOGIN_EVERY:
            last_login = time.time()
            try:
                check_logins()
            except Exception as e:
                print("login check:", e)
        time.sleep(60)
        try:
            new_articles()
        except Exception as e:
            print("new articles:", e)
        try:
            with publishing:
                subprocess.run(PUBLISH + ["due"], timeout=1800)
        except Exception as e:
            print("auto-publish:", e)


def version(p):
    return str(p.stat().st_mtime_ns) if p.exists() else "0"


def blogs():
    out = []
    for f in sorted(POSTS.glob("*/posts.json")):
        out.append({"id": f.parent.name, "version": version(f), "planning": f.parent.name in planning, "data": json.loads(f.read_text())})
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", "/docs/launch/canvas/")
            self.end_headers()
        elif self.path == "/api/blogs":
            self.send_json(200, blogs())
        elif self.path == "/api/logins":
            self.send_json(200, logins)
        else:
            super().do_GET()

    def blog_dir(self, prefix):
        m = re.fullmatch(prefix + r"/([^/?]+)(\?.*)?", self.path)
        if not m or not SLUG.fullmatch(m.group(1)):
            self.send_json(400, {"error": "bad blog id"})
            return None
        return POSTS / m.group(1)

    def do_PUT(self):
        d = self.blog_dir("/api/blogs")
        if not d:
            return
        f = d / "posts.json"
        # Refuse to overwrite a file someone else (Claude, an editor) changed since the page loaded it.
        if self.headers.get("If-Match") != version(f):
            return self.send_json(409, {"error": "changed on disk"})
        try:
            data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        except (ValueError, TypeError):
            return self.send_json(400, {"error": "bad json"})
        d.mkdir(exist_ok=True)
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        os.replace(tmp, f)
        self.send_json(200, {"version": version(f)})

    def do_POST(self):
        if self.path.startswith("/api/login/"):
            name = self.path.rsplit("/", 1)[-1]
            if name not in SITES:
                return self.send_json(400, {"error": "unknown site"})
            # Opens the site's own window; you log in and close it, then the check runs again.
            def run():
                subprocess.run(PUBLISH + ["login", name])
                check_logins()
            threading.Thread(target=run, daemon=True).start()
            return self.send_json(200, {"opened": name})
        if self.path.startswith("/api/article"):
            url = (parse_qs(urlparse(self.path).query).get("url") or [""])[0]
            if not re.fullmatch(r"https?://[^\s]+", url):
                return self.send_json(400, {"error": "give the article's link (https://...)"})
            return self.send_json(200, {"blog": new_from_link(url)})
        if self.path.startswith("/api/plan/"):
            d = self.blog_dir("/api/plan")
            if d and (d / "posts.json").exists():
                plan(d.name)
                self.send_json(200, {"planning": True})
            elif d:
                self.send_json(404, {"error": "no such blog"})
            return
        if self.path.startswith("/api/publish/"):
            d = self.blog_dir("/api/publish")
            pid = self.path.split("post=", 1)[-1]
            if not d or not SLUG.fullmatch(pid):
                return d and self.send_json(400, {"error": "bad post id"})
            out = publish("post", d.name, pid)
            return self.send_json(400 if "error" in out else 200, out)
        d = self.blog_dir("/api/media")
        if not d:
            return
        name = re.sub(r"[^\w.-]", "-", Path(unquote(self.path.split("name=", 1)[-1])).name).lstrip(".")[-80:]
        size = int(self.headers.get("Content-Length") or 0)
        if Path(name).suffix.lower() not in MEDIA_EXT or not 0 < size <= MAX_UPLOAD:
            return self.send_json(400, {"error": "image or video up to 15 MB"})
        (d / "media").mkdir(parents=True, exist_ok=True)
        rel = f"media/{int(time.time())}-{name}"
        (d / rel).write_bytes(self.rfile.read(size))
        self.send_json(200, {"file": rel})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8812
    threading.Thread(target=auto_loop, daemon=True).start()
    print(f"Launch canvas: http://127.0.0.1:{port}/")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
