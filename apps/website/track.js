// Counts every link and button click in Umami (docs/11), so new pages need no tagging.
// A data-umami-event attribute wins (Umami counts those itself); otherwise the name is the visible text.
const eventName = (el) =>
  (el.getAttribute("aria-label") || el.textContent || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "click";

globalThis.capfolderEventName = eventName;
globalThis.document?.addEventListener(
  "click",
  (e) => {
    const el = e.target.closest?.("a, button");
    if (!el || el.closest("[data-umami-event]")) return;
    globalThis.umami?.track(eventName(el), { page: location.pathname, href: el.getAttribute("href") || "" });
  },
  true,
);

// "Book a call" (Tally 8NqXQ5, integrations/tally.md), on every page. Tally loads only when someone asks for it
// (no third-party request before that); if it fails to load, the form opens on tally.so instead.
globalThis.document?.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const popup = () =>
    globalThis.Tally.openPopup("8NqXQ5", {
      layout: "modal",
      hideTitle: true,
      hiddenFields: { utm_source: params.get("utm_source") || "", ref: params.get("ref") || "" },
      onSubmit: () => globalThis.umami?.track("book-call-submitted"),
    });
  for (const b of document.querySelectorAll("[data-talk]"))
    b.addEventListener("click", () => {
      if (globalThis.Tally) return popup();
      const s = document.createElement("script");
      s.src = "https://tally.so/widgets/embed.js";
      s.onload = popup;
      s.onerror = () => {
        location.href = `https://tally.so/r/8NqXQ5?${params.toString()}`;
      };
      document.head.appendChild(s);
    });
});
