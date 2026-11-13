# Plan the posts for one article

You plan where and when one Capfolder article gets shared, draft each post, review it, and
write the posts into the canvas. You never post anything: the canvas posts them once Mads
approves the plan.

The blog folder is given below as BLOG (for example `docs/launch/posts/2026-11-20-foo`).

## 1. Read
- The article: `BLOG/<source>` (the `source` field in `BLOG/posts.json`), or its `url` if there
  is no source file. Note its images (paths relative to BLOG, or the full image URLs on the live
  page if there's no local copy; look for a local copy under `apps/website/` first).
- If posts.json only has the link (the `title` is the URL, or `date` is empty), set `title` and
  `date` from the article page.
- `docs/launch/channels.json`: every channel, its `note` (rules) and, for daily.dev squads,
  `access`.
- Every other `docs/launch/posts/*/posts.json`: the tone of earlier posts (copy it), and the
  times already taken.

## 2. Pick channels
Only channels the canvas can post by itself:
- daily.dev squads with `access` `post` or `approval` (never `no`). Pick the squads the
  article really fits, by their name and note. Meme Monday takes memes only. Build With GenAI
  takes the AI angle only. Fewer good fits beat many weak ones.
- `indiehackers`: one lesson post (what you learned, what you'd tell another founder), not an
  announcement.
- `substack`: the newsletter version, and three `substack-notes` Notes with `parent` set to
  the Substack post's id. Each Note takes a different angle or lesson from the article, so the
  Notes queue never runs dry (Mads wants at least 3 queued at all times).

Skip Reddit, HN, X, LinkedIn and the rest: Mads posts those by hand.

## 3. Timeline
Never all at once. Times are local (`tz` in posts.json, default Europe/Lisbon), `YYYY-MM-DDTHH:MM`.
- Start no earlier than tomorrow, and no earlier than the article's `date`.
- daily.dev: at most one post per squad per day, counting every blog's posts. Bunch them: put
  every squad that fits on the first weekday, starting at 15:00 and 10 minutes apart (15:00,
  15:10, 15:20…), so they never go out at once. Only a squad that already has a post that day
  moves to the next weekday.
- Indie Hackers: a weekday at 14:00, in the first week.
- Substack: Tuesday to Thursday at 09:00. The first Note goes out at 10:00 the same day, the
  next two at 10:00 two and four days later (any day of the week).
- No two posts from any blog at the same minute.

## 4. Draft
Match the earlier posts in `docs/launch/posts/2026-10-27-capfolder-0-1-4/posts.json`:
- daily.dev: `format` "text", a `title` (under 100 characters) and plain text with `•`
  bullets. Write it for that squad, and give each squad its own title and opening. End with
  the article URL plus `?ref=dailydev`. Use the article's best image as the first `media` item.
- Indie Hackers: `format` "html", `title`, `subtitle`, and the body with `<p>`, `<h2>` and
  `<ol>`. The first media item is the header image.
- Substack: `format` "html". Start the text with `<h1>` (title) and `<h3>` (subtitle). Shorter
  than the article, written to subscribers, with `<figure><img src="…" alt="…"></figure>` for
  1 or 2 images, and a link to the full article. End with a question readers can answer by
  replying.
- Substack Notes: `format` "text", 2 to 4 short lines each, the link last, one image in `media`
  (a different one per Note where the article has enough), `label` "Note 1", "Note 2", "Note 3".
- Images: JPG or PNG only. Never a GIF or a video as a post's image or cover (the sites don't
  take them); link to a GIF or video in the text instead.
- Plain words and short sentences. Value first, product second. No hype ("revolutionary",
  "game-changer"), no invented numbers, no claims the article doesn't make. Never legal advice.

## 5. Review
Read each draft again against its channel `note`, the rules above, and the article. Fix it in
place. Ask yourself: is it self-promotion the channel would remove? Is it the same text as
another squad's? Is every fact in the article? In each post's `tips`, write one line starting
with "Review:" saying what you checked or changed.

## 6. Write
Add the posts to `BLOG/posts.json`. Keep every existing post and field as it is, and keep the
file's JSON format (2-space indent, UTF-8). Each new post has:
`id` (`<channel>-<n>`, unique in the file), `parent` (null, or the Substack id for the Note),
`channel`, `label` ("Post" or "Note"), `when`, `status` "todo", `url` "", `format`, `title`
(and `subtitle` for Indie Hackers), `text`, `tips`, `media` (`[{"need": "", "file": "…",
"alt": "…"}]`), `notes` [], `auto` false and `planned` true.

Then set `planNote` at the top level of posts.json: 2 to 4 lines on which channels you picked
and why, and which you skipped.
