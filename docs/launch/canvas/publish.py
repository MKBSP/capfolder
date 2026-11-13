"""Publish canvas posts to daily.dev squads, Indie Hackers and Substack (articles + Notes) through a real browser.

  python3 docs/launch/canvas/publish.py login dailydev|indiehackers|substack   # once: log in, then close the window
  python3 docs/launch/canvas/publish.py check                         # which daily.dev squads can you post in? posts nothing
  python3 docs/launch/canvas/publish.py logins                        # are you still logged in on each site? posts nothing
  python3 docs/launch/canvas/publish.py post <blog> <post-id> [--dry]
  python3 docs/launch/canvas/publish.py due                           # every post with "auto": true whose time has come

Why a browser: these sites sit behind Cloudflare, which blocks plain HTTP clients by TLS
fingerprint (see substack-notes-automation/electron/playwright/browser.ts). Patchright is
Playwright with the automation leaks patched. Each site gets its own browser profile in
~/.capfolder-launch/, outside the repo, so the login (cookies + Indie Hackers' Firebase
IndexedDB) survives between runs. On success the post is set to posted with its live URL.
"""
import base64
import json
import mimetypes
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(os.environ.get("CANVAS_ROOT") or Path(__file__).resolve().parents[3])
POSTS = ROOT / "docs/launch/posts"
STATE = Path.home() / ".capfolder-launch"
DD_API = "https://api.daily.dev/graphql"
# Auto posts that are later than this (canvas was off) wait for a human instead.
LATE = timedelta(hours=6)
# Seconds posts.json must sit unedited before posts are scheduled ahead of time.
QUIET = 600
# Wait this long before retrying a post that failed for lack of a connection.
RETRY = timedelta(minutes=5)


def site(channel):
    if channel.startswith("dd-"):
        return "dailydev"
    if channel in ("indiehackers", "substack", "substack-notes"):
        return channel.split("-")[0]
    return None


_pw, _ctx = None, {}


def session(name):
    """One browser per site per run, shared by every post in that run.
    daily.dev runs headless (only API calls). Indie Hackers' Cloudflare check stops headless Chrome,
    so it gets a real window that is minimized straight away; Substack too (same Cloudflare)."""
    global _pw
    if name not in _ctx:
        from patchright.sync_api import sync_playwright

        STATE.mkdir(mode=0o700, exist_ok=True)
        _pw = _pw or sync_playwright().start()
        ctx = _pw.chromium.launch_persistent_context(
            str(STATE / f"{name}-profile"), headless=name == "dailydev", viewport={"width": 1280, "height": 800}, locale="en-US"
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        if name == "dailydev":
            page.goto("https://app.daily.dev/", wait_until="domcontentloaded")  # fresh cf_clearance
            page.wait_for_timeout(2000)
        else:
            if name == "substack":
                page.goto("https://substack.com/", wait_until="domcontentloaded")  # fresh cf_clearance for the API calls
                page.wait_for_timeout(3000)
            try:
                cdp = ctx.new_cdp_session(page)
                wid = cdp.send("Browser.getWindowForTarget")["windowId"]
                cdp.send("Browser.setWindowBounds", {"windowId": wid, "bounds": {"windowState": "minimized"}})
            except Exception:
                pass  # best effort: the post still works with the window showing
        _ctx[name] = ctx
    return _ctx[name]


def close_all():
    global _pw
    for ctx in _ctx.values():
        ctx.close()
    _ctx.clear()
    if _pw:
        _pw.stop()
        _pw = None


def login(name):
    from patchright.sync_api import sync_playwright

    STATE.mkdir(mode=0o700, exist_ok=True)
    pw = sync_playwright().start()
    ctx = pw.chromium.launch_persistent_context(str(STATE / f"{name}-profile"), headless=False, viewport={"width": 1280, "height": 800}, locale="en-US")
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto({"dailydev": "https://app.daily.dev/", "substack": "https://substack.com/sign-in"}.get(name, "https://www.indiehackers.com/sign-in"))
    print("Log in in the browser window, then close it.")
    page.wait_for_event("close", timeout=0)
    ctx.close()
    pw.stop()


# ---------- daily.dev ----------

def gql(ctx, query, variables=None, image=None):
    """POST through the browser (real-Chrome TLS + cookies). With image, sends a GraphQL multipart upload as $image."""
    if image:
        ops = json.dumps({"query": query, "variables": {**(variables or {}), "image": None}})
        mime = mimetypes.guess_type(image.name)[0] or "image/jpeg"
        r = ctx.request.post(DD_API, headers={"apollo-require-preflight": "true"}, multipart={
            "operations": ops, "map": json.dumps({"0": ["variables.image"]}),
            "0": {"name": image.name, "mimeType": mime, "buffer": image.read_bytes()}})
    else:
        r = ctx.request.post(DD_API, headers={"content-type": "application/json"}, data={"query": query, "variables": variables or {}})
    try:
        body = r.json()
    except Exception:
        raise RuntimeError(f"daily.dev HTTP {r.status} (not JSON, likely Cloudflare)")
    if body.get("errors"):
        raise RuntimeError("daily.dev: " + body["errors"][0].get("message", "GraphQL error"))
    return body["data"]


# Queries and mutations copied from the daily.dev web app's own bundle (their API has introspection off).
# If one breaks, load daily.dev/squads/create and search its JS for the mutation name.
SQUAD = """query($id: ID!) { source(id: $id) { id handle name type moderationRequired memberPostingRole
  postingMinReputation currentMember { role permissions } } }"""
CREATE = """mutation($sourceId: ID!, $title: String!, $content: String, $image: Upload, $scheduledAt: DateTime) {
  createFreeformPost(sourceId: $sourceId, title: $title, content: $content, image: $image, scheduledAt: $scheduledAt) {
    id commentsPermalink } }"""
# Squads with moderation take posts as "pending" through this one; it has no scheduling, so these are sent at their time.
MODERATED = """mutation($sourceId: ID!, $type: String!, $title: String, $content: String, $image: Upload) {
  createSourcePostModeration(sourceId: $sourceId, type: $type, title: $title, content: $content, image: $image) { id } }"""


def squad_handle(ch):
    return ch["compose"].rstrip("/").split("/")[-1]


def dd_squad(ctx, handle):
    s = gql(ctx, SQUAD, {"id": handle})["source"]
    m = s.get("currentMember") or {}
    s["can_post"] = "post" in (m.get("permissions") or [])
    s["moderated"] = bool(s.get("moderationRequired")) and m.get("role") not in ("admin", "moderator")
    return s


def dd_check():
    """For every daily.dev squad in channels.json: can you post there, and is it moderated? Posts nothing.
    Saves the answer as "access" (post / approval / no), which the canvas groups the squads by."""
    cf = ROOT / "docs/launch/channels.json"
    all_chans = json.loads(cf.read_text())
    chans = [c for c in all_chans if c["id"].startswith("dd-")]
    ctx = session("dailydev")
    for c in chans:
        try:
            s = dd_squad(ctx, squad_handle(c))
            m = s.get("currentMember") or {}
            verdict = "CAN POST" if s["can_post"] else "can't post (" + ("not a member" if not m else f"role {m.get('role')}") + ")"
            if s["can_post"] and s["moderated"]:
                verdict += ", needs moderator approval, no scheduling"
            print(f"{c['id']:22} {verdict}")
            c["access"] = "approval" if s["can_post"] and s["moderated"] else "post" if s["can_post"] else "no"
        except RuntimeError as e:
            print(f"{c['id']:22} ERROR {e}")
    cf.write_text("[\n" + ",\n".join("  " + json.dumps(c, ensure_ascii=False) for c in all_chans) + "\n]\n")


def utc(when, tz):
    return datetime.fromisoformat(when).replace(tzinfo=ZoneInfo(tz)).astimezone(timezone.utc)


def dd_post(p, ch, image, tz, dry):
    handle = squad_handle(ch)
    if not p.get("title"):
        raise RuntimeError("daily.dev needs a title")
    # A future time is handed to daily.dev, which publishes it then; the canvas doesn't need to stay on.
    at = utc(p["when"], tz) if p.get("when") else None
    at = at if at and at > datetime.now(timezone.utc) + timedelta(minutes=2) else None
    vars = {"title": p["title"], "content": p["text"]}
    if dry:
        return print(json.dumps({"squad": handle, "image": str(image), "scheduledAt": at and at.isoformat(), **vars}, indent=1, ensure_ascii=False))
    ctx = session("dailydev")
    s = dd_squad(ctx, handle)
    if not s["can_post"]:
        raise RuntimeError(f"You can't post in {handle} (not a member, or posting is limited to moderators)")
    if s["moderated"]:
        if at:
            raise RuntimeError(f"{handle} needs moderator approval, so it can't be scheduled; tick Auto-publish and it goes to the moderators at its time")
        gql(ctx, MODERATED, {"sourceId": s["id"], "type": "freeform", **vars}, image)
        return f"https://app.daily.dev/squads/{handle}", "Sent for moderator approval"
    made = gql(ctx, CREATE, {"sourceId": s["id"], **vars, "scheduledAt": at and at.isoformat().replace("+00:00", "Z")}, image)
    note = at and f"Scheduled on daily.dev for {p['when']}. Edits made here after that don't reach daily.dev."
    return made["createFreeformPost"]["commentsPermalink"], note


# ---------- Indie Hackers ----------

PASTE = """([sel, html]) => { const el = document.querySelector(sel); el.focus();
  const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', html.replace(/<[^>]+>/g, ''));
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }"""


def ih_post(p, image, dry):
    # Images inside the body point at local files, so they're dropped; the first media is the header image.
    body = re.sub(r"<figure.*?</figure>|<img[^>]*>", "", p["text"], flags=re.S)
    if dry:
        return print(json.dumps({"title": p.get("title"), "subtitle": p.get("subtitle"), "image": str(image), "body": body[:300]}, indent=1, ensure_ascii=False))
    if not p.get("title"):
        raise RuntimeError("Indie Hackers needs a title")
    page = session("indiehackers").pages[0]
    page.goto("https://www.indiehackers.com/new-post")
    try:
        page.wait_for_selector(".editor-post__title-input", timeout=20000)
    except Exception:
        raise RuntimeError("Not logged in to Indie Hackers: run  python3 docs/launch/canvas/publish.py login indiehackers")
    page.fill(".editor-post__title-input", p["title"])
    if p.get("subtitle"):
        page.fill(".editor-post__header-description-input", p["subtitle"])
    page.evaluate(PASTE, [".firestore-post__content", body])
    if image and image.exists():
        page.click(".editor-post__add-image")  # opens the Options panel with the upload field
        page.set_input_files("input[type=file]", str(image))
        page.wait_for_function("!document.querySelector('.post-options__image-frame')?.innerText.includes('No header image')", timeout=30000)
        page.wait_for_timeout(2000)  # upload to Firebase storage
    page.wait_for_timeout(2000)  # let the draft autosave
    page.click(".header-opts__publish-button")
    try:
        page.wait_for_url(re.compile(r"indiehackers\.com/post/"), timeout=30000)
    except Exception:
        shot = STATE / "indiehackers-failed.png"
        page.screenshot(path=str(shot))
        raise RuntimeError(f"Publish didn't land on a post page; screenshot at {shot}. The draft is in 'Your drafts'.")
    return page.url


# ---------- Substack ----------
# The same JSON API Substack's own editor calls (endpoints as in github.com/ma2za/python-substack, MIT).
# Articles become a draft that is then published, or scheduled on Substack for a future time.

def sub_api(ctx, method, url, data=None):
    r = ctx.request.fetch(url, method=method, headers={"content-type": "application/json"}, data=data)
    try:
        body = r.json()
    except Exception:
        raise RuntimeError(f"Substack HTTP {r.status} on {url.split('/api/v1')[-1]} (not JSON, likely Cloudflare)")
    if r.status == 401 or r.status == 403:
        raise RuntimeError("Not logged in to Substack: run  python3 docs/launch/canvas/publish.py login substack")
    if not r.ok:
        raise RuntimeError(f"Substack HTTP {r.status}: {str(body.get('error') or body.get('errors') or body)[:200]}")
    return body


def sub_me(ctx):
    """Your user id and your primary publication's address (always the .substack.com one: the login cookie is valid there)."""
    me = sub_api(ctx, "GET", "https://substack.com/api/v1/user/profile/self")
    pub = me.get("primaryPublication") or next((u["publication"] for u in me.get("publicationUsers") or [] if u.get("is_primary")), None) \
        or ((me.get("publicationUsers") or [{}])[0].get("publication"))
    if not pub:
        raise RuntimeError("This Substack account has no publication")
    return me["id"], f"https://{pub['subdomain']}.substack.com"


def sub_image(ctx, base, path):
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    uri = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()
    return sub_api(ctx, "POST", f"{base}/api/v1/image", {"image": uri})["url"]


def prose(html, image=lambda src: src):
    """Article HTML (as the canvas stores it) -> Substack's ProseMirror doc. <h1> is the title and the first
    <h3> the subtitle, so both come back separately. "Alt text: ..." captions are copy-paste help, not captions."""
    from html.parser import HTMLParser

    BLOCK = {"p": "paragraph", "h2": "heading", "h3": "heading", "h4": "heading", "blockquote": "blockquote",
             "ul": "bullet_list", "ol": "ordered_list", "li": "list_item", "figcaption": "caption"}
    MARK = {"b": "strong", "strong": "strong", "i": "em", "em": "em", "code": "code"}

    class P(HTMLParser):
        def __init__(s):
            super().__init__()
            s.doc, s.stack, s.marks, s.head, s.title, s.subtitle = {"type": "doc", "content": []}, [], [], None, "", ""

        def top(s):
            return s.stack[-1] if s.stack else s.doc

        def handle_starttag(s, tag, attrs):
            a = dict(attrs)
            if tag in ("h1", "h3") and not (s.title if tag == "h1" else s.subtitle) and not s.stack:
                s.head = tag
            elif tag == "figure":
                s.stack.append({"type": "captionedImage", "content": []})
            elif tag == "img":
                node = {"type": "image2", "attrs": {"src": image(a["src"]), "alt": a.get("alt"), "imageSize": "normal", "fullscreen": False}}
                (s.top()["content"] if s.stack else s.doc["content"]).append(node if s.stack else {"type": "captionedImage", "content": [node]})
            elif tag in BLOCK:
                n = {"type": BLOCK[tag], "content": []}
                if n["type"] == "heading":
                    n["attrs"] = {"level": int(tag[1])}
                s.stack.append(n)
            elif tag in MARK:
                s.marks.append({"type": MARK[tag]})
            elif tag == "a" and a.get("href", "").startswith("http"):
                s.marks.append({"type": "link", "attrs": {"href": a["href"]}})
            elif tag == "a":
                s.marks.append(None)  # relative link (e.g. "Download image"): keep the text, drop the link
            elif tag == "br" and s.stack:
                s.top()["content"].append({"type": "hard_break"})

        def handle_endtag(s, tag):
            if s.head == tag:
                s.head = None
            elif tag in BLOCK or tag == "figure":
                n = s.stack.pop()
                if n["type"] == "caption" and "".join(t.get("text", "") for t in n["content"]).startswith("Alt text:"):
                    return
                if n["type"] == "list_item":
                    # list items hold paragraphs
                    n["content"] = [{"type": "paragraph", "content": n["content"]}] if n["content"] and n["content"][0]["type"] == "text" else n["content"]
                if n["content"] or n["type"] == "captionedImage":
                    (s.top()["content"]).append(n)
            elif tag in MARK or tag == "a":
                if s.marks:
                    s.marks.pop()

        def handle_data(s, text):
            if s.head:
                setattr(s, "title" if s.head == "h1" else "subtitle", (getattr(s, "title" if s.head == "h1" else "subtitle") + text).strip())
                return
            if not s.stack or not text.strip() and not s.top()["content"]:
                return
            node = {"type": "text", "text": text}
            marks = [m for m in s.marks if m]
            if marks:
                node["marks"] = marks
            s.top()["content"].append(node)

    p = P()
    p.feed(html)
    return p.doc, p.title, p.subtitle


def note_doc(text):
    """Plain text -> a Note's doc: one paragraph per line, bare URLs as links."""
    paras = []
    for line in filter(str.strip, text.split("\n")):
        parts = [x for x in re.split(r"(https?://\S+)", line) if x]
        paras.append({"type": "paragraph", "content": [
            {"type": "text", "text": x, **({"marks": [{"type": "link", "attrs": {"href": x}}]} if re.match(r"https?://", x) else {})} for x in parts]}
            if parts else {"type": "paragraph"})
    return {"type": "doc", "attrs": {"schemaVersion": "v1"}, "content": paras}


def substack_post(p, image, tz, dry):
    ctx = None if dry else session("substack")
    if p["channel"] == "substack-notes":
        doc = note_doc(re.sub(r"<[^>]+>", "", p["text"]))
        if dry:
            return print(json.dumps({"note": doc, "image": str(image)}, indent=1, ensure_ascii=False))
        body = {"bodyJson": doc, "tabId": "for-you", "surface": "feed", "replyMinimumRole": "everyone"}
        if image and image.exists():
            # [verify] Notes image attach: upload, then register it as an attachment
            url = sub_image(ctx, "https://substack.com", image)
            body["attachmentIds"] = [sub_api(ctx, "POST", "https://substack.com/api/v1/comment/attachment", {"url": url, "type": "image"})["id"]]
        made = sub_api(ctx, "POST", "https://substack.com/api/v1/comment/feed", body)
        return f"https://substack.com/notes/post/{made.get('id') or made['comment']['id']}", None

    at = utc(p["when"], tz) if p.get("when") else None
    at = at if at and at > datetime.now(timezone.utc) + timedelta(minutes=2) else None
    if dry:
        doc, title, sub = prose(p["text"])
        return print(json.dumps({"title": p.get("title") or title, "subtitle": p.get("subtitle") or sub, "scheduledAt": at and at.isoformat(), "body": doc}, indent=1, ensure_ascii=False)[:3000])
    uid, base = sub_me(ctx)
    blog_dir = p["_dir"]
    doc, title, sub = prose(p["text"], lambda src: src if src.startswith("http") else sub_image(ctx, base, (blog_dir / src).resolve()))
    title = p.get("title") or title
    if not title:
        raise RuntimeError("Substack needs a title (an <h1> first line, or the title field)")
    draft = sub_api(ctx, "POST", f"{base}/api/v1/drafts", {
        "draft_title": title, "draft_subtitle": p.get("subtitle") or sub, "draft_body": json.dumps(doc),
        "draft_bylines": [{"id": uid, "is_guest": False}], "audience": "everyone", "type": "newsletter",
        "section_chosen": True, "write_comment_permissions": "everyone"})
    did = draft["id"]
    pre = sub_api(ctx, "GET", f"{base}/api/v1/drafts/{did}/prepublish")
    if pre.get("errors"):
        raise RuntimeError(f"Substack won't publish draft {did}: {pre['errors']}")
    if at:
        sub_api(ctx, "POST", f"{base}/api/v1/drafts/{did}/scheduled_release", {"trigger_at": at.isoformat().replace("+00:00", "Z")})
        slug = sub_api(ctx, "GET", f"{base}/api/v1/drafts/{did}").get("slug")
        return (f"{base}/p/{slug}" if slug else f"{base}/publish/post/{did}"), \
            f"Scheduled on Substack for {p['when']} (emails subscribers then). Edits made here after that don't reach Substack."
    made = sub_api(ctx, "POST", f"{base}/api/v1/drafts/{did}/publish", {"send": True, "share_automatically": False})
    return f"{base}/p/{made.get('slug') or draft.get('slug')}", None


# ---------- login check ----------

def logins():
    """{site: true/false}: is the saved login still good? Reads only; the canvas runs this every few hours."""
    out = {}
    for name, ok in (
        ("dailydev", lambda: (gql(session("dailydev"), SQUAD, {"id": "vikings"})["source"].get("currentMember") or None) is not None),
        ("substack", lambda: bool(sub_me(session("substack")))),
        ("indiehackers", lambda: ih_logged_in(session("indiehackers").pages[0])),
    ):
        try:
            out[name] = ok()
        except Exception:
            out[name] = False
    return out


def ih_logged_in(page):
    page.goto("https://www.indiehackers.com/")  # not /new-post: that leaves an empty draft behind
    try:
        page.wait_for_selector(".site-header__user-link", timeout=20000)
        return True
    except Exception:
        return False


# ---------- posts.json ----------

def write(f, data):
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    os.replace(tmp, f)


def fetch_image(url):
    """Media can be a link to an image on the live site (an article added by its link); download it once."""
    import hashlib
    import subprocess

    dest = STATE / "images" / (hashlib.sha1(url.encode()).hexdigest()[:12] + (Path(url.split("?")[0]).suffix or ".jpg"))
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        # curl, not urllib: python.org's macOS Python has no CA certificates by default
        subprocess.run(["curl", "-sfL", "--max-time", "30", "-o", str(dest), url], check=True)
    return dest


def post(blog, pid, dry=False):
    f = POSTS / blog / "posts.json"
    data = json.loads(f.read_text())
    p = next(x for x in data["posts"] if x["id"] == pid)
    if p["status"] == "posted" and not dry:
        raise RuntimeError("Already posted")
    channels = {c["id"]: c for c in json.loads((ROOT / "docs/launch/channels.json").read_text())}
    s = site(p["channel"])
    image = next((m["file"] for m in p.get("media", []) if m.get("file") and not m["file"].lower().endswith((".mp4", ".mov", ".webm", ".gif"))), None)
    image = image and (fetch_image(image) if image.startswith("http") else f.parent / image)
    note = None
    if s == "dailydev":
        url, note = dd_post(p, channels[p["channel"]], image, data.get("tz") or "Europe/Lisbon", dry) or (None, None)
    elif s == "indiehackers":
        url = ih_post(p, image, dry)
    elif s == "substack":
        url, note = substack_post({**p, "_dir": f.parent}, image, data.get("tz") or "Europe/Lisbon", dry) or (None, None)
    else:
        raise RuntimeError(f"No auto-posting for {p['channel']}; post it by hand")
    if dry:
        return None
    data = json.loads(f.read_text())  # re-read: the canvas may have saved while the browser ran
    p = next(x for x in data["posts"] if x["id"] == pid)
    p.update(status="posted", url=url, postedAt=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"))
    p.pop("autoError", None)
    p.pop("retryAt", None)
    if note:
        p["publishNote"] = note
        p["scheduled"] = note.startswith("Scheduled")
    write(f, data)
    return url


def due(now=None):
    """(blog, post) pairs to auto-publish now. Posts need "auto" on, still to do, and a time.
    In daily.dev squads you can post in, and for Substack articles, the post is scheduled on that site for its time as soon as it's ready.
    Squads needing approval, Indie Hackers and Substack Notes can't schedule, so those go out at their time, not more than LATE after it."""
    access = {c["id"]: c.get("access") for c in json.loads((ROOT / "docs/launch/channels.json").read_text())}
    out = []
    for f in sorted(POSTS.glob("*/posts.json")):
        data = json.loads(f.read_text())
        tz = ZoneInfo(data.get("tz") or "Europe/Lisbon")
        t = now or datetime.now(tz)
        # ponytail: whole-file quiet time, so a half-typed post isn't scheduled; per-post edit times if this gets in the way.
        quiet = t.timestamp() - f.stat().st_mtime > QUIET
        for p in data["posts"]:
            s, a = site(p["channel"]), access.get(p["channel"])
            if not (p.get("auto") and p["status"] == "todo" and p.get("when") and s and not p.get("autoError")) or a == "no":
                continue
            if p.get("retryAt") and datetime.fromisoformat(p["retryAt"]) > datetime.now(timezone.utc):
                continue
            when = datetime.fromisoformat(p["when"]).replace(tzinfo=tz)
            ahead = (s == "dailydev" and a == "post" and p.get("title") or p["channel"] == "substack") and when > t and quiet and p.get("text")
            if ahead or when <= t < when + LATE:
                out.append((f.parent.name, p["id"]))
    return out


def run_due():
    for i, (blog, pid) in enumerate(due()):
        if i:
            time.sleep(45)  # daily.dev: "Take a break. You already posted enough in the last 30 seconds"
        try:
            print(blog, pid, post(blog, pid))
        except Exception as e:
            f = POSTS / blog / "posts.json"
            data = json.loads(f.read_text())
            p = next(x for x in data["posts"] if x["id"] == pid)
            if "net::ERR_" in str(e):
                # No connection (laptop asleep): not the post's fault, so try again in RETRY.
                p["retryAt"] = (datetime.now(timezone.utc) + RETRY).isoformat()
                write(f, data)
                print(blog, pid, "offline, retrying in 5 minutes")
                continue
            # Park the post so the minute loop doesn't retry it forever; the canvas shows the error.
            p["autoError"] = str(e)
            write(f, data)
            print(blog, pid, "FAILED", e)


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:] or ["help"]
    try:
        if cmd == "login":
            login(rest[0])
        elif cmd == "check":
            dd_check()
        elif cmd == "post":
            print(json.dumps({"url": post(rest[0], rest[1], "--dry" in rest)}))
        elif cmd == "logins":
            print(json.dumps(logins()))
        elif cmd == "due":
            run_due()
        else:
            print(__doc__)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    finally:
        close_all()
