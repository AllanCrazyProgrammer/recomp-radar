# Recomp Radar

Recomp Radar is a static, browser-side React app hosted by Firebase Hosting. Firebase Auth signs users in with Google or GitHub; Firestore stores each user's targets, release snapshots, installed versions, cover metadata and optional social records under `users/{uid}/...`. Firestore rules protect personal data and allow an accepted friend to read only the owner's followed repository list. GitHub's unauthenticated Releases API runs in the browser when the app opens and when the tab becomes visible. Releases are cached by repository in `localStorage` with ETags; a `304` reuses the saved JSON. The client limits itself to 50 repository checks per rolling hour and exposes rate-limit errors in the UI.

Commits, pull requests, the server generated project guide, scheduled refreshes and background refreshes are not available in the static Spark architecture. Public release checks need the browser open. GitHub has a shared unauthenticated quota of 60 requests/hour; the local 50 request cap leaves headroom, but other users behind the same public IP may still exhaust GitHub's shared quota. ETag responses reduce repeat transfer and GitHub quota usage.

## Firebase setup and deployment

1. Create a Firebase project on the Spark plan with project ID `recomp-radar-allan` (or change `.firebaserc` if using another ID). Add a Firebase Web App and copy its public web config into `.env.local`; `.env.example` lists the supported `VITE_FIREBASE_*` names. These are public client configuration values, not server secrets.
2. In Firebase Console → Authentication → Sign-in method, enable Google and GitHub. For GitHub, create an OAuth App and set its callback URL to the exact URL shown by Firebase Authentication (typically `https://<project-id>.firebaseapp.com/__/auth/handler`). Add the app's Hosting domain and any custom domain to Firebase Auth's authorized domains. The project owner account is `allan.gamer@gmail.com`; Google/GitHub accounts are ordinary Firebase users.
3. Install dependencies with `npm install`, then run `npm run dev`. To use local services, start the Auth, Firestore and Hosting emulators with `firebase emulators:start`; set `VITE_USE_FIREBASE_EMULATORS=true` in `.env.local`.
4. Review `firestore.rules` and `firestore.indexes.json`, then deploy rules, indexes and Hosting with `npx firebase deploy --only firestore:rules,firestore:indexes,hosting --project recomp-radar-allan`. This repository does not create the Firebase project or deploy it automatically.
5. Sign in and import the prior export from the old site's `/api/library-export` using the in-app **Importar JSON del sitio anterior** file picker. Import writes are batched in groups under 500 and merge by stable document IDs, so retrying is idempotent. Verify the imported sources and release history after import.

## Data and covers

Personal Firestore paths are scoped by Firebase UID. A user can share their followed targets with accepted friends; installed versions, activity, covers and account data remain private. Social discovery is opt-in and uses an exact alias, not email. Browser storage contains public GitHub release cache entries and view/install preferences.

Cover URLs and metadata are stored in Firestore; Firebase Storage is not used. A local JPG/PNG upload is resized in the browser to 320 px and 640 px variants, then JPEG compressed. Both data URLs are stored only when their combined size is under 180 KB. Larger results are rejected and the user can save an HTTPS cover URL instead. URL images depend on the remote host remaining available.

## Descubrir (community catalog)

**Novedades → Descubrir** browses the public catalog of [Quiver Launcher](https://quiverlauncher.com) (`api.quiverlauncher.com/api/v1`, read-only, cached for 5 minutes, with Quiver's documented fallback host). Recomp Radar is not affiliated with Quiver: the page always credits the catalog, links each project to its Quiver page, and does not use Quiver's name or logo as its own. It works on the web and the desktop app.

- Shelves for best rated, recently updated and recently added; filters for search, original console (or a whole maker), system (defaults to this device), project type and hiding mostly-AI-made projects; "Ver todo" pages with cursor-based "Cargar más".
- Each project shows its art (SteamGridDB URLs from the catalog), what players report, systems, latest version, tags and the repository README. GitHub projects can be added to your library in one click.
- Every field is validated in `lib/quiver-catalog.ts`; images are only loaded from known hosts and links must be https.
- Release checks follow Quiver's approach: if a followed GitHub repository is in Quiver's catalog (`/release-status` index, cached 6 h), its last 20 releases come from `/apps/{slug}/release-history` (cached 30 min, 5 min on a forced refresh) and never use the 60/h public GitHub quota. Only repositories outside the catalog are checked on GitHub, and a GitHub pause no longer stops the catalog ones. Releases Quiver blocked are skipped; a release already stored from GitHub keeps its id and revision, so it is neither duplicated nor flagged as new (`lib/quiver-releases.ts`).

## Desktop version (Electron)

The same React app runs inside Electron and adds real installs: download the recommended release file, verify it against the release's SHA-256 sums when published, extract it, find the game executable and launch it. The web version is unchanged; without the desktop bridge those panels are hidden.

- `npm run desktop` builds the web app, compiles `electron/` and opens the app. It serves `dist/` from `http://localhost:47821` because Firebase Auth rejects `file://`; `localhost` is an authorized domain by default.
- `npm run dev` + `npm run desktop:dev` uses the Vite dev server instead.
- Games are stored in the app data folder (`~/Library/Application Support/recomp-radar/games/<owner>__<repo>` on macOS), with an `install.json` manifest (version, SHA-256, executable, last played).
- Supported: `.zip`, `.tar.*`, `.7z`/`.rar` (bsdtar), `.dmg` (macOS), `.AppImage` (Linux), `.exe` (Windows) and bare binaries. `.msi`, `.pkg`, `.deb`, Flatpak and APK stay as manual downloads.
- Safety: the main process only accepts `https://github.com/<repo>/releases/download/<tag>/<file>` for the same repo and tag, follows redirects only to GitHub hosts, caps the size at the release's declared size, rejects archive entries with `..` or absolute paths and symlinks that point outside the game folder, and never runs commands through a shell. The window runs with `sandbox`, `contextIsolation` and no Node integration; only the app's own origin can call the bridge.
- Installing also marks that release as your installed version in your account, so update notices keep working.
- Automatic art from SteamGridDB (desktop only): paste a free API key from steamgriddb.com → Preferences → API. The key is verified, encrypted with the OS keychain (`safeStorage`) and never reaches the page. For each game the app searches by title (then by repository name), picks the best-scored portrait, landscape grid, hero and icon, and caches results for 7 days (misses for 1 day). Only `https://cdn2.steamgriddb.com/...` image URLs are accepted. A personal cover still wins; each game page lets you search with another name or refresh.
- Desktop sign-in uses the system browser (Google blocks OAuth in embedded browsers): the app opens `/?desktop-login=…` with a one-time code, and that page posts the OAuth credential only to the app's local server.
- Each game page shows the repository README (from `raw.githubusercontent.com`, no API quota) rendered as plain React elements, never as HTML.

## Development checks

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:rules
```

The rules test command starts Firebase emulators through `firebase emulators:exec`. Emulator tests do not access a live project.
