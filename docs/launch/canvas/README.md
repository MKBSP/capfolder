# Launch canvas: how we use it

One place to plan, write, schedule and post everything that shares a Capfolder article.
A new Claude session should read this first, then `plan.md`.

## Start it
```
python3 docs/launch/canvas/server.py        # then open http://127.0.0.1:8812/
```
Keep it running: it posts scheduled posts, checks your logins every 6 hours, and picks up new
articles. If your Mac sleeps, posts that couldn't go out retry every 5 minutes once you're back
online.

## What lives where
| File | What it is |
|---|---|
| `docs/launch/posts/<blog>/posts.json` | One article ("blog") and every post that shares it. The source of truth. |
| `docs/launch/channels.json` | Every channel: name, composer link, rules (`note`), and for daily.dev squads `access` (post / approval / no). |
| `canvas/index.html` | The canvas. |
| `canvas/server.py` | Serves the canvas, saves edits, runs the minute loop. |
| `canvas/publish.py` | Posts to daily.dev, Indie Hackers and Substack through a real browser with your saved login. |
| `canvas/plan.md` | What Claude does when it plans an article's posts. Edit it to change the rules. |
| `~/.capfolder-launch/` | Saved browser logins, one folder per site. Outside the repo, never commit. |

## A new article
1. **Add it.** Either click **+ Article** in the top bar and paste the live article's link,
   or drop a folder with `index.html` or `article.md` into `docs/launch/posts/`.
2. **Claude plans it.** Headless Claude Code reads the article and `channels.json`, picks the
   channels, times the posts so nothing goes out at once, drafts and reviews each post. It
   takes a few minutes; the posts appear in the canvas by themselves. The log is
   `posts/<blog>/plan.log`. To plan an existing article again: open it (click the article card)
   and click **Plan posts for this article**.
3. **Review and approve.** Read the plan note and the posts, edit what you want, then click
   **Approve plan: auto-publish N posts** in the article's drawer.

## Who posts what
- **Posts itself** (Auto-publish ticked):
  - **daily.dev**, in squads where you can post: scheduled on daily.dev ahead of time, 10
    minutes after the last edit.
  - **daily.dev**, in squads that need approval: sent to the moderators at the post's time.
  - **Indie Hackers**: posted at its time.
  - **Substack articles**: scheduled on Substack ahead of time, emailed to subscribers then.
  - **Substack Notes**: posted at their time.
  - Edits made after a post is scheduled don't reach the site.
- **You post by hand** (X, Reddit, HN, LinkedIn and the rest): follow the step card at the top
  of **Attend first**. It shows one post at a time: the text, the images, and the link that
  opens the composer already filled in (an X reply opens under its parent).
  1. Copy and paste what it shows, and post.
  2. Copy your new post's link: on X, Share → Copy link. Come back to the canvas and the link
     fills in by itself (allow clipboard access the first time).
  3. Click **Done ✓**. The next step appears, and a reply now knows which post it answers.
- **Not posted by anything:** daily.dev squads marked "Can't post", and posts marked Skip.

## Rules we keep
- Never post everything at once. At most one post per daily.dev squad per day; posts to
  different squads on the same day go out 10 minutes apart. No two posts at the same minute.
- At least 3 Substack Notes queued at all times. Attend first warns when there are fewer.
- daily.dev, Indie Hackers and Substack only post by themselves. Reddit, HN and X stay by hand
  (those sites ban automated accounts). Replies to comments: Claude drafts, you approve.
- Value first, product second; no hype; only facts the article states; never legal advice.

## When something needs you
Attend first shows it:
- **Not logged in to <site>**: click Log in. A window opens; log in, then close it.
- **A post shows an error**: open it. The error says what failed. Fix it, then click Publish now.
  A failed Indie Hackers post stays in your Indie Hackers drafts; a screenshot of the failure is
  at `~/.capfolder-launch/indiehackers-failed.png`.

## Commands
```
python3 docs/launch/canvas/publish.py login dailydev|indiehackers|substack   # log in once
python3 docs/launch/canvas/publish.py logins                                 # still logged in?
python3 docs/launch/canvas/publish.py check        # which daily.dev squads you can post in (updates channels.json)
python3 docs/launch/canvas/publish.py post <blog> <post-id> [--dry]          # one post now (--dry: show, don't post)
python3 docs/launch/canvas/test_publish.py && python3 docs/launch/canvas/test_server.py
```

## Later
X, Reddit, HN and LinkedIn by API (bundle.social, postforme.dev, zernio), then videos: make,
upload, and link to them from posts and Notes.
