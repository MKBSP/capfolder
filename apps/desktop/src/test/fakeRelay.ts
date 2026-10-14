import { createApp, type MailExtra } from "@capfolder/relay/app";
import { fakeDocumenso } from "@capfolder/relay/fake-documenso";

/** The real relay app over an in-memory Documenso, reachable through Platform.fetch in tests. */
export function fakeRelay() {
  const doc = fakeDocumenso();
  const mails: { to: string; subject: string; text: string; extra?: MailExtra }[] = [];
  const app = createApp({
    documenso: doc.api,
    secret: "desktop-test-secret",
    now: () => Date.now(),
    sendMail: async (to, subject, text, extra) => {
      mails.push({ to, subject, text, extra });
    },
  });
  let down = false;
  return {
    doc,
    mails,
    lastCode: () => /\b(\d{6})\b/.exec(mails.at(-1)?.text ?? "")?.[1] ?? "",
    setDown: (d: boolean) => {
      down = d;
    },
    fetch: async (url: string, init?: RequestInit) => {
      if (down) throw new TypeError("Failed to fetch");
      const u = new URL(url);
      return app.request(u.pathname + u.search, init);
    },
  };
}
