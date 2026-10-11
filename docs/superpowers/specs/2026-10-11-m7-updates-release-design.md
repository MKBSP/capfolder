# M7 · Updates + release (F-38) — design

Goal (docs/09): v0.1.0 → v0.1.1 auto-updates on all three OS; a rules-pack change shows up with no restart. Topic doc: `docs/07-updates-and-rules-pack.md`.

## 1. App updates
- `tauri-plugin-updater` 2.13.0 + `tauri-plugin-process` 2.4.0 (relaunch). `bundle.createUpdaterArtifacts: true`.
- Endpoint: `https://github.com/MKBSP/capfolder/releases/latest/download/latest.json` (written by `tauri-action`). Signature key: `tauri signer generate`; the public key is in `tauri.conf.json`, the private key lives outside the repo (`~/.tauri/capfolder-updater.key`) and in the CI secret `TAURI_SIGNING_PRIVATE_KEY`. **Lose it and installed apps can never update: back it up offline.**
- App: `updates.ts` behind `platform.updater` (fakeable). On open and every 6 hours, unless Settings → Updates is Off:
  - **Automatic** (default): download and install in the background, then a bar "Capfolder x.y is installed · What changed · Restart now".
  - **Ask**: a bar "Capfolder x.y is ready · What changed · Update now".
  - **Off**: never checks. "Check now" in Settings always works.
- Every write to the vault is a single append, so restarting is always safe.

## 2. Release builds (`.github/workflows/release.yml`)
- On a `v*` tag: `tauri-action` builds macOS (Apple Silicon and Intel), Windows and Linux into a **draft** release with `latest.json`. Mads checks and publishes the draft. Updates point at the latest published release.
- macOS: code-signed and notarized from secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. Windows: `WINDOWS_CERTIFICATE` (.pfx, base64) + `WINDOWS_CERTIFICATE_PASSWORD`, imported and passed as the certificate thumbprint.
- Ship nothing unsigned: the job fails when signing secrets are missing, unless it's started by hand with "allow unsigned" (for testing).
- Version: 0.1.0 in `package.json`, `Cargo.toml`, `tauri.conf.json` (a test keeps them equal).

## 3. Rules pack (signed JSON, hot-swapped)
- `rules/rules.json` + `rules/rules.json.sig` in the repo, fetched from `raw.githubusercontent.com/MKBSP/capfolder/main/rules/` (GitHub release downloads send no CORS headers; raw does). Ruling: changes docs/07's "rules-latest release tag".
- Signature: ed25519 over the exact file bytes (`@noble/ed25519`, pure JS, works in every webview). Private key outside the repo (`~/.capfolder/rules-signing.key`), signed with `pnpm rules:sign`. Public key in `apps/desktop/src/rules.ts`.
- Format `capfolder-rules/1`: `version` (YYYY.MM.DD-n), `min_app_version`, `export_guides` (Import screen steps), `doc_types` (sorting phrases per type). The bundled copy is the default, so the app works offline.
- The app checks on open and daily; a pack is used only if the signature verifies, the format is known, `version` is newer and `min_app_version` ≤ the app's. It is cached in app data and swapped in at once (React state), no restart.
- Core `classify`/`sortText` accept doc-type rules; the defaults stay in core, and a test keeps `rules/rules.json` equal to them.

## Not in M7
Touch ID / Windows Hello (needs a native plugin; stays "later"), learned-rule sharing, import detectors in the pack (none exist until real vendor files arrive).

## Tests
Updater flows with a fake updater (auto installs and offers restart; ask waits for the click; off never checks). Rules: bad signature, older version, newer min_app_version and unknown format are all ignored; a good pack changes the Import steps without a restart; the bundled pack equals the core defaults; versions are equal across the three files.
