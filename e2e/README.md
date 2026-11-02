# Browser play-through

`npm run e2e` starts a small harness (`e2e/harness`) with Vite and plays through the table features
in Chromium: attacks and Extra Attack, a fireball's damage, monster recharge and legendary actions,
concentration, level up and the "Your turn" banner.

The harness renders the app's real pages and components (the battle map, token cards, turn helper,
spellbook, chat…) but swaps the database for in-memory fakes: Firestore services, the Realtime
Database table state and the chat are replaced through Vite aliases (`harness/vite.config.ts`). The
campaign is in `harness/state.ts` (Lyra, a druid; Brom, a fighter with a longsword and an off-hand
handaxe; goblins and a goblin boss with a recharge ability and legendary actions) and
`harness/sceneStore.ts` (the map and the fight).

Setup, once:

```bash
npm i -D playwright
npx playwright install chromium
```

Then `npm run e2e`. Failures leave a screenshot in `e2e/.out/`.

To poke at it by hand: `npx vite --config e2e/harness/vite.config.ts` and open
`http://localhost:5310/e2e/harness/index.html?view=map&as=dm` (the DM) or `?view=map` (Lyra's
player). Other views: `?view=page&char=brom` (a character page), `?view=battle`. In the browser
console `__h` has the hooks the play-through uses (`__h.live()`, `__h.scene()`, `__h.messages()`,
`__h.openPlay(...)`…).
