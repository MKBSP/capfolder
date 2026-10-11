import { render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./App";
import { acmePlatform } from "./test/acme";

function boot(settings: object, sent: { url: string; body: Record<string, unknown> }[], now = Date.now()) {
  const fp = acmePlatform({
    relay: {
      fetch: async (url: string, init?: RequestInit) => {
        if (url.endsWith("/ping")) sent.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(null, { status: url.endsWith("/ping") ? 204 : 404 });
      },
    },
  });
  const s = JSON.parse(fp.fs.readSync("/appdata/settings.json"));
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({ ...s, relayUrl: "http://relay.test", termsAccepted: "2026-10-10", ...settings }),
  );
  const realNow = Date.now;
  Date.now = () => now;
  render(<App platform={fp.platform} />);
  Date.now = realNow;
  return fp;
}

test("first run sends one anonymous ping with exactly the documented fields (docs/11)", async () => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fp = boot({ telemetry: true }, sent);
  await screen.findByText("Fully diluted");
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]!.url).toBe("http://relay.test/ping");
  expect(Object.keys(sent[0]!.body).sort()).toEqual(
    ["app_version", "event", "has_documents", "imported", "install_id", "os", "sent_envelope"].sort(),
  );
  expect(sent[0]!.body).toMatchObject({
    event: "first_run",
    app_version: "0.1.0",
    has_documents: true,
    imported: false,
  });
  expect(sent[0]!.body.install_id).toMatch(/^[0-9a-f-]{36}$/);
  const saved = JSON.parse(fp.fs.readSync("/appdata/settings.json"));
  expect(saved.ping).toMatchObject({ installId: sent[0]!.body.install_id, firstRunSent: true });
});

test("then weekly, not more often", async () => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const id = "3b9f0c2e-6a51-4c3e-9d0a-1f2b3c4d5e6f";
  boot(
    {
      telemetry: true,
      ping: { installId: id, firstRunSent: true, last: new Date(Date.now() - 3 * 864e5).toISOString() },
    },
    sent,
  );
  await screen.findByText("Fully diluted");
  await new Promise((r) => setTimeout(r, 50));
  expect(sent).toEqual([]);
});

test("a week later: one weekly ping", async () => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const id = "3b9f0c2e-6a51-4c3e-9d0a-1f2b3c4d5e6f";
  boot(
    {
      telemetry: true,
      ping: { installId: id, firstRunSent: true, last: new Date(Date.now() - 8 * 864e5).toISOString() },
    },
    sent,
  );
  await waitFor(() => expect(sent.map((s) => [s.body.event, s.body.install_id])).toEqual([["weekly", id]]));
});

test("off in Settings: nothing is sent", async () => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  boot({ telemetry: false }, sent);
  await screen.findByText("Fully diluted");
  await new Promise((r) => setTimeout(r, 50));
  expect(sent).toEqual([]);
});

test("nothing is sent before the founder accepts the terms that disclose it", async () => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  boot({ telemetry: true, termsAccepted: "" }, sent);
  await screen.findByText("Fully diluted");
  await new Promise((r) => setTimeout(r, 50));
  expect(sent).toEqual([]);
});

test("a brand-new install is counted as soon as the terms are accepted (not only on the next launch)", async () => {
  const { fakePlatform } = await import("./test/fakePlatform");
  const { default: userEvent } = await import("@testing-library/user-event");
  const sent: string[] = [];
  const fp = fakePlatform({
    relay: {
      fetch: async (url: string, init?: RequestInit) => {
        if (url.endsWith("/ping")) sent.push(JSON.parse(String(init?.body)).event);
        return new Response(null, { status: url.endsWith("/ping") ? 204 : 404 });
      },
    },
  });
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByLabelText("No lock"));
  expect(sent).toEqual([]);
  await userEvent.click(screen.getByLabelText(/I accept the/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(sent).toEqual(["first_run"]));
});

test("a garbled last-ping date doesn't stop the weekly ping", async () => {
  const { maybePing } = await import("./ping");
  const { TERMS_VERSION } = await import("./copy");
  const fp = acmePlatform({ relay: { fetch: async () => new Response(null, { status: 204 }) } });
  const s = {
    ...JSON.parse(fp.fs.readSync("/appdata/settings.json")),
    telemetry: true,
    termsAccepted: TERMS_VERSION,
    relayUrl: "http://relay.test",
    ping: { installId: "3b9f0c2e-6a51-4c3e-9d0a-1f2b3c4d5e6f", firstRunSent: true, last: "garbage" },
  };
  expect(await maybePing(fp.platform, s, null, "0.1.0")).not.toBeNull();
  expect(
    await maybePing(fp.platform, { ...s, ping: { ...s.ping, last: "2099-01-01T00:00:00Z" } }, null, "0.1.0"),
  ).not.toBeNull();
});
