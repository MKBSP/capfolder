// Cloudflare Pages Function: Umami analytics through capfolder.com/stats, so the CSP stays same-origin
// and blockers that drop third-party analytics hosts still let our cookieless page counts through (docs/11).
const ROUTES = {
  "/stats/script.js": "https://cloud.umami.is/script.js",
  "/stats/api/send": "https://gateway.umami.is/api/send",
};

export async function onRequest({ request }) {
  const target = ROUTES[new URL(request.url).pathname];
  if (!target) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "user-agent": request.headers.get("user-agent") ?? "" });
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for", ip); // Umami counts unique visitors and countries from this
  if (request.method === "POST") headers.set("content-type", "application/json");
  return fetch(target, {
    method: request.method === "POST" ? "POST" : "GET",
    headers,
    body: request.method === "POST" ? await request.text() : undefined,
  });
}
