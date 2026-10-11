import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOC_RULES } from "@capfolder/core";
import * as ed from "@noble/ed25519";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { SOURCES } from "./importRules";
import { acceptPack, BUNDLED_RULES, RULES_PUBLIC_KEY, type RulesPack } from "./rules";
import { acmePlatform } from "./test/acme";

const ROOT = resolve(process.cwd(), "../..");
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
const testKey = ed.utils.randomSecretKey();
const sign = async (bytes: Uint8Array, key = testKey) =>
  Buffer.from(await ed.signAsync(bytes, key)).toString("base64");

vi.mock("./rules", async (orig) => {
  const m = await orig<typeof import("./rules")>();
  return {
    ...m,
    // the app verifies packs with this key; tests sign with their own throwaway key
    fetchRules: (p: never, current: RulesPack, v: string) =>
      m.fetchRules(p, current, v, (globalThis as { __rulesKey?: string }).__rulesKey),
    cachedRules: (p: never, v: string) =>
      m.cachedRules(p, v, (globalThis as { __rulesKey?: string }).__rulesKey),
  };
});

function boot(opts: Parameters<typeof acmePlatform>[0], settings: object = {}) {
  const fp = acmePlatform(opts);
  const s = JSON.parse(fp.fs.readSync("/appdata/settings.json"));
  fp.fs.writeSync("/appdata/settings.json", JSON.stringify({ ...s, ...settings }));
  render(<App platform={fp.platform} />);
  return fp;
}

describe("app updates (F-38)", () => {
  test("automatic: downloads in the background, installs only on Restart now", async () => {
    const fp = boot({ update: { version: "0.1.1", notes: "Faster sorting." } });
    await screen.findByText("Capfolder 0.1.1 is downloaded.", { exact: false });
    expect(fp.updates).toEqual(["check", "download 0.1.1"]);
    await userEvent.click(screen.getByRole("button", { name: "What changed" }));
    expect(screen.getByText("Faster sorting.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Restart now" }));
    await waitFor(() => expect(fp.updates).toEqual(["check", "download 0.1.1", "install 0.1.1", "relaunch"]));
  });
  test("ask: nothing is downloaded until the founder says so", async () => {
    const fp = boot({ update: { version: "0.1.1", notes: "" } }, { updates: "ask" });
    await screen.findByText("Capfolder 0.1.1 is available.", { exact: false });
    expect(fp.updates).toEqual(["check"]);
    await userEvent.click(screen.getByRole("button", { name: "Update now" }));
    await waitFor(() => expect(fp.updates).toEqual(["check", "download 0.1.1", "install 0.1.1", "relaunch"]));
  });
  test("off: never checks", async () => {
    const fp = boot({ update: { version: "0.1.1", notes: "" } }, { updates: "off" });
    await screen.findByText("Fully diluted");
    expect(fp.updates).toEqual([]);
  });
});

describe("rules pack (docs/07 §2)", () => {
  const pack = (over: Partial<RulesPack> = {}) => ({ ...BUNDLED_RULES, version: "2026.12.01-1", ...over });
  const pub = async () => hex(await ed.getPublicKeyAsync(testKey));

  test("a newer pack signed with our key is accepted", async () => {
    const bytes = enc(pack());
    expect((await acceptPack(bytes, await sign(bytes), BUNDLED_RULES, "0.1.0", await pub()))?.version).toBe(
      "2026.12.01-1",
    );
  });
  test("tampered, wrongly signed, older, too new for this app, or unknown format: ignored", async () => {
    const k = await pub();
    const bytes = enc(pack());
    const tampered = enc(pack({ version: "2026.12.01-2" }));
    expect(await acceptPack(tampered, await sign(bytes), BUNDLED_RULES, "0.1.0", k)).toBeNull();
    expect(
      await acceptPack(bytes, await sign(bytes, ed.utils.randomSecretKey()), BUNDLED_RULES, "0.1.0", k),
    ).toBeNull();
    const older = enc(pack({ version: "2026.01.01-1" }));
    expect(await acceptPack(older, await sign(older), BUNDLED_RULES, "0.1.0", k)).toBeNull();
    const future = enc(pack({ min_app_version: "0.2.0" }));
    expect(await acceptPack(future, await sign(future), BUNDLED_RULES, "0.1.0", k)).toBeNull();
    const odd = enc({ ...pack(), format: "capfolder-rules/2" });
    expect(await acceptPack(odd, await sign(odd), BUNDLED_RULES, "0.1.0", k)).toBeNull();
    const badRegex = enc(pack({ doc_types: [{ type: "safe", phrases: ["(unclosed"] }] }));
    expect(await acceptPack(badRegex, await sign(badRegex), BUNDLED_RULES, "0.1.0", k)).toBeNull();
  });
  test("a newer signed pack is swapped in while the app is open (no restart)", async () => {
    (globalThis as { __rulesKey?: string }).__rulesKey = await pub();
    const next = pack({
      export_guides: {
        ...BUNDLED_RULES.export_guides,
        pulley: { title: "Pulley", steps: ["New Pulley steps from the pack."] },
      },
    });
    const bytes = enc(next);
    const sig = await sign(bytes);
    boot({
      relay: {
        fetch: async (url: string) =>
          url.endsWith("rules.json")
            ? new Response(bytes)
            : url.endsWith(".sig")
              ? new Response(sig)
              : new Response("", { status: 404 }),
      },
    });
    await screen.findByText("Fully diluted");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByText(/Rules 2026\.12\.01-1/);
    delete (globalThis as { __rulesKey?: string }).__rulesKey;
  });
  test("the shipped pack is signed with the app's key and matches the built-in defaults", async () => {
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, "rules/rules.json")));
    const sig = readFileSync(resolve(ROOT, "rules/rules.json.sig"), "utf8");
    const older = { ...BUNDLED_RULES, version: "2000.01.01-1" };
    expect((await acceptPack(bytes, sig, older, "0.1.0", RULES_PUBLIC_KEY))?.version).toBe(
      BUNDLED_RULES.version,
    );
    expect(BUNDLED_RULES.doc_types).toEqual(DOC_RULES);
    for (const s of SOURCES) expect(BUNDLED_RULES.export_guides[s.id]?.steps).toEqual(s.steps);
  });
});

test("the version is the same in package.json, Cargo.toml and tauri.conf.json", () => {
  const app = resolve(ROOT, "apps/desktop");
  const pkg = JSON.parse(readFileSync(resolve(app, "package.json"), "utf8")).version;
  const cargo = /^version = "(.+)"/m.exec(readFileSync(resolve(app, "src-tauri/Cargo.toml"), "utf8"))?.[1];
  const tauri = JSON.parse(readFileSync(resolve(app, "src-tauri/tauri.conf.json"), "utf8")).version;
  expect([pkg, cargo, tauri]).toEqual([pkg, pkg, pkg]);
});
