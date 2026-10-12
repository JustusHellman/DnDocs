# Security rules tests

Runs `../firestore.rules` in the real Firestore emulator and checks who may read and write what
(player characters, notes, battle maps, tokens, drawings, pings and the DM's secret numbers).

Needs Node 20+ and Java 11+ (for the emulator). From this folder:

```bash
npm install
npm test
```

The first run downloads the emulator. Nothing touches your real Firebase project
(it uses the offline `demo-dndocs` project).
