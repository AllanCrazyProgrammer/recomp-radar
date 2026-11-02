# Migration validation

The static build preserves the retro Windows menu, library sorting/filtering/layout options, install asset ranking, OS and architecture detection, remembered installer variants, SHA-256 checks, Wine/Proton hints, release comparison and cover fallback behavior. Locally uploaded covers use 320 px and 640 px JPEG data URLs and remain subject to the combined 180 KB Firestore limit.

Validation commands and results are reported with the migration change. A live Firebase project, OAuth providers, production domains and deploy were not configured or exercised. Emulator rule tests require local listener ports and should be run with `npm run test:rules` in an environment that allows localhost sockets.
