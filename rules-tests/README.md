# Security rules tests

Runs `../firestore.rules` in the real Firestore emulator and checks who may read and write what
(player characters, notes, battle maps, tokens, drawings, pings and the DM's secret numbers), and
`../database.rules.json` in the Realtime Database emulator (the table's live state: trackers, the
turn helper's marks, the DM's private marks, spell cards and written descriptions).
`npm run test:database` runs just the second.

Needs Node 20+ and Java 11+ (for the emulator). From this folder:

```bash
npm install
npm test
```

The first run downloads the emulator. Nothing touches your real Firebase project
(it uses the offline `demo-dndocs` project).
