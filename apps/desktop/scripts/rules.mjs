// Rules pack signing (docs/07). `keygen` once (keep the key safe, offline too), `sign` after every rules/rules.json change.
// The key lives outside the repo: ~/.capfolder/rules-signing.key (or RULES_SIGNING_KEY, hex).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as ed from "@noble/ed25519";

const KEY = join(homedir(), ".capfolder", "rules-signing.key");
const PACK = new URL("../../../rules/rules.json", import.meta.url);
const hex = (b) => Buffer.from(b).toString("hex");
const secret = () => Buffer.from(process.env.RULES_SIGNING_KEY ?? readFileSync(KEY, "utf8").trim(), "hex");

const cmd = process.argv[2];
if (cmd === "keygen") {
  if (existsSync(KEY)) throw new Error(`${KEY} exists; refusing to overwrite it`);
  mkdirSync(join(homedir(), ".capfolder"), { recursive: true });
  const sk = ed.utils.randomSecretKey();
  writeFileSync(KEY, `${hex(sk)}\n`);
  chmodSync(KEY, 0o600);
  console.log(
    `private key: ${KEY}\npublic key (put in src/rules.ts): ${hex(await ed.getPublicKeyAsync(sk))}`,
  );
} else if (cmd === "sign") {
  const bytes = readFileSync(PACK);
  const pack = JSON.parse(bytes.toString("utf8"));
  if (pack.format !== "capfolder-rules/1" || !/^\d{4}\.\d\d\.\d\d-\d+$/.test(pack.version))
    throw new Error("bad pack");
  const sig = await ed.signAsync(bytes, secret());
  writeFileSync(
    new URL("../../../rules/rules.json.sig", import.meta.url),
    `${Buffer.from(sig).toString("base64")}\n`,
  );
  console.log(`signed rules ${pack.version} (public key ${hex(await ed.getPublicKeyAsync(secret()))})`);
} else {
  console.log("usage: node scripts/rules.mjs keygen | sign");
}
