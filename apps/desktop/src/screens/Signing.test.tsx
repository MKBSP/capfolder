import { makeToken } from "@capfolder/relay/auth";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";
import { fakePlatform } from "../test/fakePlatform";
import { fakeRelay } from "../test/fakeRelay";

const ME = "mads@acme.example";

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

async function sendSafe() {
  await userEvent.click(screen.getByRole("button", { name: "+ New" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "SAFE" }));
  await userEvent.type(screen.getByLabelText("Name"), "Fund Y");
  await userEvent.type(screen.getByLabelText("Email"), "fund@y.example");
  await userEvent.type(screen.getByLabelText(/^Amount/), "200000");
  await userEvent.type(screen.getByLabelText(/^Valuation cap/), "10000000");
  await userEvent.click(screen.getByRole("button", { name: "Send for signature" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByLabelText("Title")).toHaveValue("SAFE · Fund Y");
  await userEvent.click(within(dialog).getByRole("button", { name: "Choose PDF…" }));
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
});

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
