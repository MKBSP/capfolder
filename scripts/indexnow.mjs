// Tell Bing (and the other IndexNow engines) about every page in the live sitemap. Run after a deploy:
//   node scripts/indexnow.mjs
// The key file apps/website/<key>.txt is published at the site root, which proves we own capfolder.com.
import { readdirSync } from "node:fs";

const key = readdirSync(new URL("../apps/website/", import.meta.url))
  .find((f) => /^[0-9a-f]{32}\.txt$/.test(f))
  ?.replace(".txt", "");
const xml = await (await fetch("https://capfolder.com/sitemap.xml")).text();
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const r = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: "capfolder.com",
    key,
    keyLocation: `https://capfolder.com/${key}.txt`,
    urlList,
  }),
});
console.log(`IndexNow: ${r.status} for ${urlList.length} URLs`); // 200 or 202 = accepted
