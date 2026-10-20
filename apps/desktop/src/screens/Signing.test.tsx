import { makeToken } from "@capfolder/relay/auth";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { App } from "../App";
import { pageTexts } from "../pdfverify";
import { acmePlatform } from "../test/acme";
import { fakePlatform } from "../test/fakePlatform";
import { fakeRelay } from "../test/fakeRelay";

const ME = "tim@apple.com";

async function pdf(text: string) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([612, 792]).drawText(text, { x: 72, y: 700, size: 12, font: f });
  return d.save();
}

/** Acme, verified with a fake relay, with a PDF ready to pick. */
async function signedIn(file = "Purchase Amount $200,000") {
  const relay = fakeRelay();
  const fp = acmePlatform({ relay, pickFile: { path: "/home/me/Downloads/safe.pdf", name: "safe.pdf" } });
  fp.fs.writeSync("/home/me/Downloads/safe.pdf", await pdf(file));
  const s = JSON.parse(fp.fs.readSync("/appdata/settings.json"));
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({
      ...s,
      relayUrl: "http://relay.test",
      email: ME,
      relayToken: makeToken("desktop-test-secret", ME, Date.now()),
    }),
  );
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
  return { ...fp, relay };
}

async function sendSafe(own = true, before?: (dialog: HTMLElement) => Promise<void>) {
  await userEvent.click(screen.getByRole("button", { name: "+ New" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "SAFE" }));
  await userEvent.type(screen.getByLabelText("Name"), "Fund Y");
  await userEvent.type(screen.getByLabelText("Email"), "fund@y.example");
  await userEvent.type(screen.getByLabelText(/^Amount/), "200000");
  await userEvent.type(screen.getByLabelText(/^Valuation cap/), "10000000");
  await userEvent.click(screen.getByRole("button", { name: "Send for signature" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByLabelText("Title")).toHaveValue("SAFE · Fund Y");
  if (own) {
    await userEvent.click(within(dialog).getByLabelText("Your own PDF"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose PDF…" }));
  }
  await before?.(dialog);
  await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
  await screen.findByRole("heading", { name: "Signatures" });
}

test("first run: verify the email with a 6-digit code", async () => {
  const relay = fakeRelay();
  const { platform, fs } = fakePlatform({ relay });
  fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({
      deviceId: "d",
      lock: "none",
      idleMinutes: 15,
      telemetry: true,
      recentVaults: [],
      termsAccepted: "x",
      region: "US",
      relayUrl: "http://relay.test",
      email: "",
      relayToken: "",
    }),
  );
  render(<App platform={platform} />);
  await userEvent.click(await screen.findByLabelText(/I accept the/));
  await userEvent.click(screen.getByLabelText("No lock"));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.type(await screen.findByLabelText("Email"), ME);
  await userEvent.click(screen.getByRole("button", { name: "Send code" }));
  expect(await screen.findByText(`We sent a 6-digit code to ${ME}`)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Code"), "000000");
  await userEvent.click(screen.getByRole("button", { name: "Verify & continue" }));
  expect(await screen.findByText("That's not the code. Check the email and try again.")).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Code"));
  await userEvent.type(screen.getByLabelText("Code"), relay.lastCode());
  await userEvent.click(screen.getByRole("button", { name: "Verify & continue" }));
  expect(await screen.findByLabelText("Legal name")).toBeInTheDocument();
  const s = JSON.parse(fs.readSync("/appdata/settings.json"));
  expect([s.email, s.relayToken.length > 20]).toEqual([ME, true]);
});

test("send a SAFE for signature, countersign, and it files itself when complete", async () => {
  const fp = await signedIn();
  await sendSafe();
  const env = [...fp.relay.doc.envelopes.values()][0]!;
  expect(env.recipients.map((r) => [r.email, r.signingOrder])).toEqual([
    ["fund@y.example", 1],
    [ME, 2],
  ]);
  expect(await screen.findByText("Waiting for Fund Y")).toBeInTheDocument();
  expect(fp.fs.readSync(`${fp.root}/events.jsonl`)).toContain('"type":"envelope_sent"');
  const issued = (log: string) =>
    log
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((e) => e.type === "TX_CONVERTIBLE_ISSUANCE" && e.data.security_id === "SAFE-4");
  expect(issued(fp.fs.readSync(`${fp.root}/events.jsonl`))).toEqual([]); // not on the cap table until signed

  fp.relay.doc.sign(env.id, "fund@y.example");
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await userEvent.click(await screen.findByRole("button", { name: "Sign now" }));
  expect(fp.opened).toEqual([`http://documenso.test/sign/${env.recipients[1]!.token}`]);

  const sent = env.pdf;
  const sealed = await PDFDocument.load(sent);
  sealed.addPage([612, 792]); // Documenso's certificate page
  fp.relay.doc.sign(env.id, ME, await sealed.save());
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText(/Signed and filed in docs\/safes\//)).toBeInTheDocument();
  const log = fp.fs.readSync(`${fp.root}/events.jsonl`);
  expect(log).toContain('"type":"envelope_signed"');
  expect(issued(log)).toHaveLength(1);
  expect(fp.relay.doc.calls.at(-1)).toBe(`remove ${env.id}`);
  expect((await fp.fs.list(`${fp.root}/docs/safes`)).some((n) => n.includes("fund-y"))).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Cap table" }));
  fireEvent.change(await screen.findByLabelText("As of"), {
    target: { value: new Date().toISOString().slice(0, 10) },
  });
  expect((await screen.findByRole("table")).textContent).toContain("Fund Y");
}, 20_000);

test("a signed copy that doesn't match what was sent is not filed", async () => {
  const fp = await signedIn();
  await sendSafe();
  const env = [...fp.relay.doc.envelopes.values()][0]!;
  fp.relay.doc.sign(env.id, "fund@y.example");
  fp.relay.doc.sign(env.id, ME, await pdf("Purchase Amount $2,000,000"));
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText(/Signed copy doesn't match what you sent/)).toBeInTheDocument();
  expect(fp.fs.readSync(`${fp.root}/events.jsonl`)).not.toContain('"type":"envelope_signed"');
});

test("cancel before it's signed: voided, and the relay deletes its copy", async () => {
  const fp = await signedIn();
  await sendSafe();
  const env = [...fp.relay.doc.envelopes.values()][0]!;
  await userEvent.click(await screen.findByRole("button", { name: "Cancel & delete from relay" }));
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel the document" }),
  );
  expect(await screen.findByText("Nothing waiting for signatures.")).toBeInTheDocument();
  expect(fp.fs.readSync(`${fp.root}/events.jsonl`)).toContain('"type":"envelope_voided"');
  expect(fp.relay.doc.calls.slice(-2)).toEqual([`cancel ${env.id}`, `remove ${env.id}`]);
});

test("relay down: a plain message, nothing else breaks", async () => {
  const fp = await signedIn();
  fp.relay.setDown(true);
  await userEvent.click(screen.getByRole("button", { name: "Documents" }));
  await userEvent.click(await screen.findByRole("button", { name: "Send for signature" }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.type(within(dialog).getByLabelText("Title"), "Board consent");
  await userEvent.click(within(dialog).getByRole("button", { name: "Choose PDF…" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
  expect(
    await within(dialog).findByText(
      "Can't reach the signing relay. Everything else works; try again when you're online.",
    ),
  ).toBeInTheDocument();
  await act(async () => {});
  expect(fp.fs.readSync(`${fp.root}/events.jsonl`)).not.toContain("envelope_sent");
});

async function sendDocument(title: string) {
  await userEvent.click(screen.getByRole("button", { name: "Documents" }));
  await userEvent.click(await screen.findByRole("button", { name: "Send for signature" }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.type(within(dialog).getByLabelText("Title"), title);
  await userEvent.type(within(dialog).getByLabelText("Signer 1 name"), "Steve Jobs");
  await userEvent.type(within(dialog).getByLabelText("Signer 1 email"), "steve@apple.com");
  await userEvent.click(within(dialog).getByRole("button", { name: "Choose PDF…" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
  await screen.findByRole("heading", { name: "Signatures" });
}
const complete = async (fp: Awaited<ReturnType<typeof signedIn>>, id: string) => {
  const env = fp.relay.doc.envelopes.get(id)!;
  for (const r of env.recipients) fp.relay.doc.sign(id, r.email);
};
const events = (fp: { fs: { readSync(p: string): string }; root: string }) =>
  fp.fs
    .readSync(`${fp.root}/events.jsonl`)
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

describe("M5 review", () => {
  test("C1: two SAFEs out at once both file, each with its own id", async () => {
    const fp = await signedIn();
    await sendSafe();
    await userEvent.click(screen.getByRole("button", { name: "Cap table" }));
    await sendSafe();
    const [a, b] = [...fp.relay.doc.envelopes.keys()];
    await complete(fp, b!);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/Signed and filed/);
    await complete(fp, a!);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getAllByText(/Signed and filed/)).toHaveLength(2));
    const safes = events(fp)
      .filter((e) => e.type === "TX_CONVERTIBLE_ISSUANCE")
      .map((e) => e.data.security_id);
    expect(safes.slice(-2).sort()).toEqual(["SAFE-4", "SAFE-5"]);
    expect(events(fp).filter((e) => e.type === "envelope_signed")).toHaveLength(2);
  });

  test("C2: if the SAFE was already recorded (an earlier filing broke halfway), filing finishes without a duplicate", async () => {
    const fp = await signedIn();
    await sendSafe();
    const id = [...fp.relay.doc.envelopes.keys()][0]!;
    const sent = events(fp).find((e) => e.type === "envelope_sent")!;
    // simulate the half-finished filing: the SAFE drafts are in the record, the envelope isn't closed
    const { appendToVault, openVault } = await import("../vault");
    const ctx = {
      now: () => new Date(),
      newId: () => `evt_X${Math.random().toString(36).slice(2, 10)}`,
      deviceId: "d",
    };
    const v = await openVault(fp.fs, fp.root, ctx);
    const r = await appendToVault(fp.fs, v, sent.data.on_signed, ctx);
    expect(r.ok).toBe(true);
    cleanup();
    render(<App platform={fp.platform} />);
    await screen.findByText("Fully diluted");
    await userEvent.click(screen.getByRole("button", { name: "Signatures" }));
    await complete(fp, id);
    await userEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/Signed and filed/)).toBeInTheDocument();
    expect(
      events(fp).filter((e) => e.type === "TX_CONVERTIBLE_ISSUANCE" && e.data.security_id === "SAFE-4"),
    ).toHaveLength(1);
  });

  test("I1: after one is filed, the rest keep being checked (no 'Not found' stop)", async () => {
    const fp = await signedIn();
    await sendDocument("Consent A");
    await sendDocument("Consent B");
    const [a] = [...fp.relay.doc.envelopes.keys()];
    await complete(fp, a!);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/Signed and filed/);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await act(async () => {});
    expect(screen.queryByText("Not found")).toBeNull();
    expect(await screen.findByText("Waiting for Steve Jobs")).toBeInTheDocument();
  });

  test("I2: switching relays keeps checking envelopes on the relay they were sent through", async () => {
    const fp = await signedIn();
    await sendDocument("Consent A");
    const other = fakeRelay();
    const s = JSON.parse(fp.fs.readSync("/appdata/settings.json"));
    // the founder moved to a self-hosted relay; the old envelope stays on the first one
    fp.fs.writeSync(
      "/appdata/settings.json",
      JSON.stringify({
        ...s,
        relayUrl: "http://other.test",
        relayToken: "",
        relayTokens: { "http://relay.test": s.relayToken },
      }),
    );
    const orig = fp.platform.fetch;
    fp.platform.fetch = (url, init) =>
      url.startsWith("http://other.test") ? other.fetch(url, init) : orig(url, init);
    cleanup();
    render(<App platform={fp.platform} />);
    await screen.findByText("Fully diluted");
    await userEvent.click(screen.getByRole("button", { name: "Signatures" }));
    expect(await screen.findByText("Waiting for Steve Jobs")).toBeInTheDocument();
  });

  test("I4: a signed copy with something drawn or annotated on an original page isn't filed", async () => {
    const fp = await signedIn();
    await sendDocument("Consent A");
    const env = [...fp.relay.doc.envelopes.values()][0]!;
    const doctored = await PDFDocument.load(env.pdf);
    const { PDFName, PDFString } = await import("pdf-lib");
    const page = doctored.getPage(0);
    const annot = doctored.context.obj({
      Type: "Annot",
      Subtype: "FreeText",
      Rect: [72, 680, 300, 700],
      Contents: PDFString.of("$2,000,000"),
      DA: PDFString.of("/Helv 12 Tf 0 g"),
    });
    page.node.set(PDFName.of("Annots"), doctored.context.obj([doctored.context.register(annot)]));
    for (const r of env.recipients) fp.relay.doc.sign(env.id, r.email, await doctored.save());
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText(/Signed copy doesn't match what you sent/)).toBeInTheDocument();
  });

  test("I6: amounts keep their own currency after the company changes currency", async () => {
    const fp = await signedIn();
    const meta = JSON.parse(fp.fs.readSync(`${fp.root}/capfolder.json`));
    fp.fs.writeSync(`${fp.root}/capfolder.json`, JSON.stringify({ ...meta, currency: "EUR" }));
    cleanup();
    render(<App platform={fp.platform} />);
    await screen.findByText("Fully diluted");
    fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
    expect((await screen.findByRole("table")).textContent).toContain("$500,000");
  });

  test("I7: verifying inside the send dialog still knows your name", async () => {
    const fp = await signedIn();
    const s = JSON.parse(fp.fs.readSync("/appdata/settings.json"));
    fp.fs.writeSync("/appdata/settings.json", JSON.stringify({ ...s, email: "", relayToken: "" }));
    cleanup();
    render(<App platform={fp.platform} />);
    await screen.findByText("Fully diluted");
    await userEvent.click(screen.getByRole("button", { name: "Documents" }));
    await userEvent.click(await screen.findByRole("button", { name: "Send for signature" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Email"), ME);
    await userEvent.click(within(dialog).getByRole("button", { name: "Send code" }));
    await userEvent.type(await within(dialog).findByLabelText("Code"), fp.relay.lastCode());
    await userEvent.click(within(dialog).getByRole("button", { name: "Verify" }));
    await userEvent.type(await within(dialog).findByLabelText("Title"), "Consent");
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose PDF…" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("heading", { name: "Signatures" })).toBeInTheDocument();
    expect([...fp.relay.doc.envelopes.values()][0]!.recipients.map((r) => r.name)).toEqual(["Tim Apple"]);
  });

  test("I8: if recording the send fails, the envelope is withdrawn from the relay", async () => {
    const fp = await signedIn();
    const write = fp.fs.writeBytes.bind(fp.fs);
    fp.fs.writeBytes = async (p, b) => {
      if (p.includes("_outbox")) throw new Error("disk full");
      return write(p, b);
    };
    await userEvent.click(screen.getByRole("button", { name: "Documents" }));
    await userEvent.click(await screen.findByRole("button", { name: "Send for signature" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Title"), "Consent");
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose PDF…" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(await within(dialog).findByText(/disk full/)).toBeInTheDocument();
    const id = [...fp.relay.doc.envelopes.keys()][0]!;
    expect(fp.relay.doc.calls).toContain(`remove ${id}`);
  });
});

describe("send feedback (beta test)", () => {
  test("an unexpected failure while sending is shown, never silence", async () => {
    const fp = await signedIn();
    const read = fp.platform.fs.readText;
    fp.platform.fs.readText = async (p: string) => {
      if (p.endsWith("events.jsonl")) throw new Error("Operation not permitted");
      return read(p);
    };
    await userEvent.click(screen.getByRole("button", { name: "Documents" }));
    await userEvent.click(await screen.findByRole("button", { name: "Send for signature" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Title"), "Consent");
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose PDF…" }));
    await userEvent.type(within(dialog).getByLabelText("Signer 1 name"), "Steve");
    await userEvent.type(within(dialog).getByLabelText("Signer 1 email"), "steve@apple.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(await within(dialog).findByText(/Nothing was sent.*Operation not permitted/)).toBeInTheDocument();
    expect(fp.relay.doc.envelopes.size).toBe(0);
  });

  test("after sending, Signatures confirms who was emailed", async () => {
    await signedIn();
    await sendSafe();
    expect(await screen.findByText(/Sent “SAFE · Fund Y”\. Emailed fund@y\.example/)).toBeInTheDocument();
  });

  test("your signing name is remembered when no person on the cap table has your email", async () => {
    const fp = await signedIn();
    const s = JSON.parse(fp.fs.readSync("/appdata/settings.json"));
    fp.fs.writeSync("/appdata/settings.json", JSON.stringify({ ...s, email: "other@me.example" }));
    cleanup();
    render(<App platform={fp.platform} />);
    await screen.findByText("Fully diluted");
    const open = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Documents" }));
      await userEvent.click(await screen.findByRole("button", { name: "Send for signature" }));
      return screen.findByRole("dialog");
    };
    let dialog = await open();
    await userEvent.type(within(dialog).getByLabelText("Title"), "Consent");
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose PDF…" }));
    await userEvent.type(within(dialog).getByLabelText("Your name, as it should appear"), "Tim P");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await screen.findByRole("heading", { name: "Signatures" });
    dialog = await open();
    expect(within(dialog).getByLabelText("Your name, as it should appear")).toHaveValue("Tim P");
  });
});

test("security: an envelope pointing at a relay this computer never used isn't contacted", async () => {
  const fp = await signedIn();
  await sendDocument("Consent A");
  const log = fp.fs.readSync(`${fp.root}/events.jsonl`);
  // someone with write access to the folder repoints the envelope; appending keeps the chain valid only via the app,
  // so simulate a fresh vault state read by swapping the relay field in what the app reads
  const calls: string[] = [];
  const orig = fp.platform.fetch;
  fp.platform.fetch = (url, init) => {
    calls.push(url);
    return orig(url, init);
  };
  const { envelopes } = await import("../signing");
  const env = envelopes(
    log
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l)),
  )[0]!;
  const { relayFor } = await import("../signing");
  const s = JSON.parse(fp.fs.readSync("/appdata/settings.json"));
  expect(relayFor(s, { ...env, relay: "http://evil.test" })).toBeNull();
  expect(relayFor(s, env)).toEqual({ relayUrl: "http://relay.test", relayToken: s.relayToken });
  expect(calls.filter((u) => u.includes("evil"))).toEqual([]);
});

const sentTitles = (fp: Awaited<ReturnType<typeof signedIn>>) =>
  fp.fs
    .readSync(`${fp.root}/events.jsonl`)
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => e.type === "envelope_sent")
    .map((e) => e.data.title);

describe("YC templates, side letters and wire instructions", () => {
  test("a capped SAFE goes out as YC's post-money SAFE, filled in, without picking a file", async () => {
    const fp = await signedIn();
    await sendSafe(false);
    const env = [...fp.relay.doc.envelopes.values()][0]!;
    const texts = await pageTexts(env.pdf);
    // signed on YC's own signature page (the last one): no Capfolder page added after it
    expect(texts.at(-1)).toMatch(/^IN WITNESS WHEREOF/);
    expect(texts.join(" ")).not.toContain("Added by Capfolder");
    expect(texts.join(" ")).toContain("payment by Fund Y");
    const sent = fp.fs
      .readSync(`${fp.root}/events.jsonl`)
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .find((e) => e.type === "envelope_sent");
    expect(sent.data.original_pages).toBe(texts.length - 1);
    expect(sentTitles(fp)).toEqual(["SAFE · Fund Y"]);
  });

  test("cap and discount together: YC has no such form, so it asks for your own PDF", async () => {
    await signedIn();
    await userEvent.click(screen.getByRole("button", { name: "+ New" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "SAFE" }));
    await userEvent.type(screen.getByLabelText("Name"), "Fund Y");
    await userEvent.type(screen.getByLabelText("Email"), "fund@y.example");
    await userEvent.type(screen.getByLabelText(/^Amount/), "200000");
    await userEvent.type(screen.getByLabelText(/^Valuation cap/), "10000000");
    await userEvent.type(screen.getByLabelText(/^Discount/), "20");
    await userEvent.click(screen.getByRole("button", { name: "Send for signature" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/YC has no SAFE with both a valuation cap and a discount/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Choose PDF…" })).toBeInTheDocument();
  });

  test("a side letter is its own document with its own signatures", async () => {
    const fp = await signedIn();
    await sendSafe(false, async (dialog) => {
      await userEvent.click(within(dialog).getByLabelText("Add a side letter"));
      await userEvent.click(within(dialog).getByLabelText("YC pro rata side letter"));
    });
    const [, side] = [...fp.relay.doc.envelopes.values()];
    expect(sentTitles(fp)).toEqual(["SAFE · Fund Y", "Pro rata side letter · Fund Y"]);
    expect(side!.recipients.map((r) => r.email)).toEqual(["fund@y.example", ME]);
    expect(
      await screen.findByText(/Sent “SAFE · Fund Y” and “Pro rata side letter · Fund Y”/),
    ).toBeInTheDocument();
  });

  test("once everyone signed: send wire instructions, uploading them first if needed", async () => {
    const fp = await signedIn();
    await sendSafe(false);
    const env = [...fp.relay.doc.envelopes.values()][0]!;
    fp.relay.doc.sign(env.id, "fund@y.example");
    const sealed = await PDFDocument.load(env.pdf);
    sealed.addPage([612, 792]);
    fp.relay.doc.sign(env.id, ME, await sealed.save());
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(/Signed and filed in docs\/safes\//);

    await userEvent.click(await screen.findByRole("button", { name: "Send wire instructions" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Upload your wire instructions first/)).toBeInTheDocument();
    fp.fs.writeSync("/home/me/Downloads/safe.pdf", await pdf("Bank: Example Bank, account 123"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Choose PDF…" }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "Send to Fund Y" }));

    expect(await screen.findByText("Wire instructions sent")).toBeInTheDocument();
    const mail = fp.relay.mails.find((m) => m.extra?.attachments)!;
    expect(mail.to).toBe("fund@y.example");
    expect(mail.extra!.attachments!.map((a) => a.filename)).toEqual([
      "SAFE · Fund Y (signed).pdf",
      "Wire instructions.pdf",
    ]);
    const log = fp.fs.readSync(`${fp.root}/events.jsonl`);
    expect(log).toContain('"type":"wire_sent"');
    expect(log).toContain('"doc_type":"wire_instructions"');
  });
});
