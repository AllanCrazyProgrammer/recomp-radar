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

## Development checks

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:rules
```

The rules test command starts Firebase emulators through `firebase emulators:exec`. Emulator tests do not access a live project.
