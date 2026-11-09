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

// "Book a call" on every page: our own form (apps/website/forms.js, integrations/forms.md), loaded only when
// someone asks for it (no third-party request before that).
globalThis.document?.addEventListener("DOMContentLoaded", () => {
  for (const b of document.querySelectorAll("[data-talk]"))
    b.addEventListener("click", () =>
      import("/forms.js").then((m) =>
        m.open("book-a-call", { onSubmit: () => globalThis.umami?.track("book-call-submitted") }),
      ),
    );
});
