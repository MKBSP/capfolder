// forms.js: the site's own form dialog (download, Pro waitlist, Book a call). DOM behaviour is checked by hand
// (integrations/forms.md, local development); these tests cover the parts that don't need a browser.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { FORMS as API } from "../../functions/api/submit.js";
import { ERROR_HTML, FORMS, toFields, waitForToken } from "./forms.js";

const src = readFileSync(new URL("./forms.js", import.meta.url), "utf8");

test("FORMS in forms.js matches FORMS in the function (ids, field order, options, required)", () => {
  expect(Object.keys(FORMS)).toEqual(Object.keys(API));
  for (const id of Object.keys(API)) {
    expect(Object.keys(FORMS[id].fields)).toEqual(Object.keys(API[id]));
    for (const [name, f] of Object.entries(API[id])) {
      const ui = FORMS[id].fields[name];
      expect([id, name, ui.type, ui.required ?? false, ui.options]).toEqual([
        id,
        name,
        f.type,
        f.required ?? false,
        f.options,
      ]);
    }
  }
});

test("toFields: checkbox groups become arrays, a checkbox becomes a boolean, utm/ref come from the search string", () => {
  const fd = new FormData();
  fd.append("email", "a@b.co");
  fd.append("help", "Incorporating");
  fd.append("help", "Something else");
  fd.append("updates", "on");
  expect(
    toFields(
      fd,
      {
        email: { type: "email" },
        help: { type: "checkboxes" },
        updates: { type: "checkbox" },
        utm_source: { type: "text" },
        ref: { type: "text" },
      },
      "?utm_source=hn&ref=bookface",
    ),
  ).toEqual({
    email: "a@b.co",
    help: ["Incorporating", "Something else"],
    updates: true,
    utm_source: "hn",
    ref: "bookface",
  });
});

test("toFields: an unticked checkbox is false, an empty group is [], missing hidden params are empty strings", () => {
  const fd = new FormData();
  expect(
    toFields(
      fd,
      {
        before: { type: "checkboxes" },
        updates: { type: "checkbox" },
        utm_source: { type: "text" },
        ref: { type: "text" },
      },
      "",
    ),
  ).toEqual({
    before: [],
    updates: false,
    utm_source: "",
    ref: "",
  });
});

test("toFields passes the honeypot through untouched", () => {
  const fd = new FormData();
  fd.append("website", "http://spam");
  expect(toFields(fd, { email: { type: "email" } }, "").website).toBe("http://spam");
});

test("every form has intro, thanks and a button label; ERROR_HTML points at privacy@capfolder.com", () => {
  for (const [id, f] of Object.entries(FORMS)) {
    expect([id, typeof f.title, typeof f.intro, f.thanks.length, typeof f.button]).toEqual([
      id,
      "string",
      "string",
      2,
      "string",
    ]);
    for (const field of Object.values(f.fields)) expect(typeof field.label).toBe("string");
  }
  expect(ERROR_HTML).toContain('href="mailto:privacy@capfolder.com"');
});

test("forms.js never references tally.so and loads Turnstile explicitly, only when opened", () => {
  expect(src).not.toContain("tally.so");
  expect(src).toContain("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
  expect(src).toContain('appearance: "interaction-only"');
});

test("waitForToken returns a token that is already there", async () => {
  expect(await waitForToken(() => "tok", 50, 1)).toBe("tok");
});

test("waitForToken waits for a slow bot check", async () => {
  let reads = 0;
  expect(await waitForToken(() => (++reads < 4 ? undefined : "late"), 500, 1)).toBe("late");
  expect(reads).toBe(4);
});

test("waitForToken gives up with an empty token", async () => {
  expect(await waitForToken(() => undefined, 10, 1)).toBe("");
});

test("submit waits for the token instead of reading it once", () => {
  expect(src).toContain("await waitForToken(");
});
