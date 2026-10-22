# Operations: deployment, backups and recovery

For the owner who publishes and maintains their instance. How to use the app is in [user-guide.md](user-guide.md).

_Versión en español: [operacion.md](operacion.md)._

## 1. Deployment

The app is static: there is no application server and no remote database (spec §1).

**Build.** Run `pnpm install`, then `pnpm build`. The output goes to `dist/`. `pnpm build` also:

- copies the engine fonts (without Liberation Sans);
- generates `LICENSE.txt` and `THIRD-PARTY-NOTICES.txt`, which must be published with the app.

**Public configuration.** `.env` (versioned) holds `VITE_GOOGLE_CLIENT_ID`. It is public by design. The OAuth client secret is not used anywhere.

**Current hosting:** Cloudflare Worker with static assets.

- `wrangler.jsonc` publishes `dist/`, answering unknown routes as a single-page app.
- The origin is https://aline.projeck.workers.dev. It must match the "Authorized JavaScript origins" of the OAuth client in Google Cloud.
- Cloudflare adds `Report-To` and `NEL` headers; they are worth reviewing against RNF-05.

**Headers.** `public/_headers` holds:

- the CSP, enforced since 2026-10-20 (plan 9.1);
- `nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy`.

When connecting Drive, the console shows "Cross-Origin-Opener-Policy policy would block the window.closed call" warnings: Google's library produces them while watching its sign-in window, not the CSP, and they are expected (they don't prevent authorizing). `tests/e2e/csp.spec.ts` serves the app with that CSP and fails on any violation. The Google part can only be checked against real Google: after publishing, connect Drive, sync, reload and disconnect with the console open. If Google changed and something got blocked ("Refused to…" messages), temporarily switch back to `Content-Security-Policy-Report-Only`, add the missing origin and try again.

**Before publishing,** run `pnpm verify` and `pnpm test:e2e`.

**Updates.** Browsers that already have the app see "A new version is available". On "Update", the app saves pending work before switching version; it never updates in the middle of a write.

## 2. Backups

The vault lives in each device's browser. The browser can delete it: when site data is cleared or, on iPad, when space runs low. **Backups are the owner's responsibility.**

| What | How | Recommended frequency |
| --- | --- | --- |
| Full backup (ZIP) | Status and diagnostics → "Download full backup (ZIP)" | Weekly and before big changes |
| Folder or Google Drive | "Where it is stored" | Continuous while the app is open |
| Markdown | Library → "Import and export" → "Export all notes as Markdown" | Optional, to read notes with any editor |

- **The ZIP backup is the only one that keeps everything:** history, trash, controls, folders, tags and attachments. Its manifest verifies every file by SHA-256.
- **Keep it off the device,** on another disk or another service.
- **Encrypted Drive:** also keep the recovery code, outside Google and off the device. Without the password or the code, the Drive copy cannot be read. The local ZIP backup is not encrypted and does not depend on them.

## 3. Recovery

| Situation | What to do |
| --- | --- |
| Browser data was cleared | Open the app → Status and diagnostics → restore the latest ZIP backup; or, from another device or a new vault, connect the folder or Drive and choose "Open that vault here" |
| A ZIP backup fails verification | Nothing is restored; try another backup. The app says which file fails |
| The browser cannot open IndexedDB | The app offers a temporary in-memory vault so nothing typed is lost; export it before closing |
| Local save fails (space, error) | "Out of space" or "Save failed" appears and the emergency export is offered; free space and try again |
| Forgotten Drive password | Unlock with the recovery code, then change the password in "Encryption and password" |
| Password and code both lost | The encrypted Drive copy cannot be recovered. If a device still has the vault open, remove encryption or make a ZIP backup from that device |
| Conflict between devices | Conflict panel: choose one version, merge them or keep them as separate documents. None is lost until resolved |
| A document opens "read-only" | It was saved by a newer format version, or its content is invalid. It is not modified; update the app or check diagnostics |
| Document deleted by mistake | Trash → "Restore". If it was deleted permanently, restore an earlier ZIP backup into a new vault and export the document |

**Reading the data without the app.** The open format is specified in [formato-almacen.md](formato-almacen.md):

- notes are Markdown;
- canvases are `.excalidraw`;
- versions are JSON verifiable by SHA-256;
- a vault encrypted in Drive is decrypted following §7 of that document.

## 4. Diagnostics

Status and diagnostics shows:

- storage usage and whether the browser marked it as persistent;
- the sync status;
- a local error log, rotated by size, which never stores note text or tokens.

"Export diagnostics" downloads that log for analysis.
