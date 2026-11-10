// A quick play-through of the table features in a real browser, against the harness in
// e2e/harness (the app's own components, with the database swapped for in-memory fakes).
// Run: npm run e2e   (needs Playwright: npm i -D playwright && npx playwright install chromium)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, '.out');
const PORT = 5310;
const BASE = `http://localhost:${PORT}/e2e/harness/index.html?`;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'e2e/harness/vite.config.ts'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('vite did not start')), 60000);
  vite.stdout.on('data', (d) => String(d).includes('Local:') && (clearTimeout(t), ok()));
  vite.on('exit', (c) => fail(new Error(`vite exited (${c})`)));
});

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let failed = 0;
async function check(name, fn) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await fn(page);
    if (errors.length) throw new Error(`page error: ${errors[0]}`);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n    ${String(e).split('\n')[0]}`);
    await page.screenshot({ path: path.join(out, `${name.replace(/\W+/g, '-')}.png`) }).catch(() => undefined);
  }
  await page.close();
}
const open = async (page, q) => {
  await page.goto(BASE + q, { timeout: 60000 });
  await page.waitForFunction(() => window.__h, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
};
const ev = (page, f, a) => page.evaluate(f, a);
const expectEq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};
const next = async (page, n) => {
  for (let i = 0; i < n; i++) {
    await page.locator('button:has-text("Next turn")').click();
    await page.waitForTimeout(250);
  }
};

await check('attacks use the Attack action and Extra Attack', async (p) => {
  await open(p, 'view=map&as=dm');
  await next(p, 2); // Brom's turn
  await p.locator('button:has-text("What can I do?")').click();
  for (let i = 0; i < 3; i++) {
    await p.locator('[role=region] button:has-text("Longsword")').first().click();
    await p.waitForTimeout(250);
  }
  const live = await ev(p, () => window.__h.live().play.c_brom);
  expectEq([live.ac, live.aa], [1, 2], 'actions / attacks (the third is refused)');
  await p.locator('[role=tab]:has-text("Bonus")').first().click();
  await p.locator('[role=region] button:has-text("Handaxe")').first().click();
  await p.waitForTimeout(250);
  expectEq(await ev(p, () => window.__h.live().play.c_brom.ba), 1, 'off-hand attack takes the bonus action');
});

await check('a fireball placed by the DM damages the goblins', async (p) => {
  await open(p, 'view=map&as=dm');
  await ev(p, () => window.__h.openPlay({ kind: 'cast', entityId: 'lyra', spellId: 'fireball' }));
  await p.locator('[role=dialog] button:has-text("Cast at")').click();
  await p.locator('[role=dialog] button:has-text("map")').first().click();
  // Point at a goblin on the map (its token sits under its label).
  const box = await p.locator('text=GB').first().boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.up();
  await p.locator('[aria-label="Damage total"]').fill('30');
  await p.locator('[role=dialog] button:has-text("Apply the damage")').click();
  await p.waitForTimeout(500);
  const hp = await ev(p, () => window.__h.secretHp());
  if (!(hp.gob2.cur < 21)) throw new Error(`the boss took no damage: ${JSON.stringify(hp)}`);
});

await check('a recharge ability is used up, legendary actions count their cost', async (p) => {
  await open(p, 'view=map&as=dm');
  await next(p, 3); // the boss's turn
  await p.locator('button:has-text("What can I do?")').click();
  await p.locator('[role=region] >> text=Fire Spit').first().click();
  await p.waitForTimeout(300);
  const rc = await ev(p, () => window.__h.live().play.t_gob2?.rc);
  if (!rc || !Object.values(rc).includes(5)) throw new Error(`not marked: ${JSON.stringify(rc)}`);
  await next(p, 1);
  await p.locator('text=GB').first().click();
  // Its card shows first (not its turn); its options are the other tab, legendary actions their own.
  await p.locator('[aria-label="Side panel"] button[title^="What Goblin Boss"]').click();
  await p.locator('[role=tab]:has-text("Legend")').click();
  await p.locator('[role=region] >> text=Taunt').first().click();
  await p.locator('[role=region] >> text=Costs 2 Actions').first().click();
  await p.waitForTimeout(300);
  expectEq(await ev(p, () => window.__h.live().play.t_gob2.la), 1, 'legendary actions used (the 2-cost one refused)');
});

await check('concentration: the token and the tracker agree', async (p) => {
  await open(p, 'view=map&as=dm');
  const conds = () => ev(p, () => window.__h.scene().tokens.find((t) => t.id === 'tlyra').conditions);
  await ev(p, () => window.__h.patchPlay('c1', 'c_lyra', 'p1', 'Lyra Starwhisper', { conc: 'moonbeam' }));
  await p.waitForTimeout(400);
  expectEq(await conds(), ['Concentrating'], 'condition after the tracker starts concentrating');
  await ev(p, () => window.__h.patchPlay('c1', 'c_lyra', 'p1', 'Lyra Starwhisper', { conc: null }));
  await p.waitForTimeout(400);
  expectEq(await conds(), [], 'condition after it stops');
});

await check('level up adds a level and hit points', async (p) => {
  await open(p, 'view=page&as=dm&char=brom');
  await p.locator('button:has-text("Level up")').first().click();
  await p.locator('[role=dialog] button.btn-primary').click();
  await p.waitForTimeout(400);
  const brom = await ev(p, () => window.__h.entities().find((e) => e.id === 'brom'));
  expectEq([brom.attributes.classLevel, brom.dndStats.hitPoints], ['Fighter 6', '58'], 'class and max HP');
});

await check('the side panel: one place for the turn list and the token card', async (p) => {
  await open(p, 'view=map');
  // Lyra's player looks at a goblin: its card, and it is NOT her target (that's picked on purpose).
  await p.locator('button:has-text("What can I do?")').click();
  await p.locator('text=G1').first().click();
  await p.locator('[aria-label="Side panel"] button:has-text("Goblin 1")[aria-pressed="true"]').waitFor();
  await p.locator('[aria-label="Side panel"] button[title^="What Lyra"]').click();
  await p.locator('[role=region] >> text=No target').waitFor();
  // Only one turn list and one card on screen.
  const regions = await p.locator('[role=region][aria-label^="What"]').count();
  if (regions !== 1) throw new Error(`${regions} turn lists`);
});

await check('targets are picked on purpose; damage waits for Apply', async (p) => {
  await open(p, 'view=map&as=dm');
  await next(p, 1);
  // Looking at Brom on a goblin's turn: no target.
  await p.locator('text=BI').first().click();
  if (await ev(p, () => document.querySelector('[aria-label="Side panel"]')?.textContent?.includes('Target Brom'))) throw new Error('looking made a target');
  await p.keyboard.press('Escape');
  await next(p, 1); // Brom's turn
  await p.locator('button:has-text("What can I do?")').click();
  await p.locator('[role=region] button:has-text("Pick target")').click();
  await p.locator('text=G1').first().click();
  await p.locator('[role=region] >> text=25 ft away').waitFor();
  await p.locator('[role=region] button:has-text("Longsword")').first().click();
  const asked = await ev(p, () => (window.__confirms ?? []).map((q) => q.title));
  expectEq(asked, ['Out of reach?'], 'asked before attacking out of reach');
  const before = await ev(p, () => window.__h.secretHp().gob1.cur);
  expectEq(before, 7, 'no damage before Apply');
  await p.locator('[role=region] button:has-text("Apply")').first().click();
  await p.locator('[aria-label="Damage total"]').fill('4');
  await p.locator('[role=dialog] button:has-text("Apply the damage")').click();
  await p.waitForTimeout(300);
  expectEq(await ev(p, () => window.__h.secretHp().gob1.cur), 3, 'the typed damage, applied');
});

await check('/attack in the chat aims like the turn list; dragging a token counts no movement', async (p) => {
  await open(p, 'view=map&chat=1');
  await p.locator('button:has-text("What can I do?")').click();
  await p.locator('[role=region] button:has-text("Pick target")').click();
  await p.locator('text=G1').first().click();
  await p.locator('textarea, input[placeholder^="Message"]').first().fill('/attack quarterstaff');
  await p.keyboard.press('Enter');
  await p.locator('[role=status]:has-text("Apply damage")').waitFor();
  expectEq(await ev(p, () => (window.__confirms ?? []).map((q) => q.title)), ['Out of reach?'], 'the same reach check');
  // Lyra is up: drag her two squares.
  const box = await p.locator('text=LS').first().boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + 120, box.y + 10, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  expectEq(await ev(p, () => window.__h.live().play.c_lyra?.mv ?? null), null, 'movement after a drag');
});

await check('the spellbook stays on Prepare while spells change', async (p) => {
  await open(p, 'view=page');
  // Opened on Ready (the Spells button), then switched to Prepare.
  await ev(p, () => window.__h.openPlay({ kind: 'spells', entityId: 'lyra' }));
  await p.locator('[role=dialog] button:has-text("Prepare")').first().click();
  await p.locator('[role=dialog] li').first().locator('button:has-text("Known")').click();
  // The character missing for a moment while the list reloads (as after a save).
  await ev(p, () => window.__h.flicker('lyra'));
  await p.waitForTimeout(400);
  const onPrepare = await p.locator('[role=dialog] >> text=/Prepared \\d+ of \\d+/').count();
  if (!onPrepare) throw new Error('the book went back to Ready');
});

await check('"Your turn" banner on other pages', async (p) => {
  await open(p, 'view=page&char=lyra');
  await ev(p, () => window.__h.setCombat({ turn: 'tlyra', turnBy: ['p1'], turnName: 'Lyra Starwhisper' }));
  await p.locator('[role=status]:has-text("Your turn")').waitFor();
});

await browser.close();
vite.kill();
console.log(failed ? `\n${failed} failed (screenshots in e2e/.out)` : '\nAll good.');
process.exit(failed ? 1 : 0);
