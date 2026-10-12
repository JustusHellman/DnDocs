# DnDocs

A shared archive for Dungeons & Dragons campaigns. The DM writes up NPCs, places, factions, shops,
items, monsters, quests and notes; players see exactly what the DM reveals to them — per entry,
per field, or per player.

Works on desktop, tablet and phone (it can also be added to the home screen).

Icons: [game-icons.net](https://game-icons.net) by Lorc, Delapouite and contributors, licensed CC BY 3.0 (via react-icons).

## Features

- **Campaigns** – create one as DM or join with a 6-character code / QR invite link. Owners can
  promote co-DMs, remove players and rename the campaign.
- **Entries** for 11 built-in types, each with its own fields (ratings, selects, links to other entries),
  markdown descriptions, tags, images, and D&D stat blocks for NPCs and monsters.
- **Player characters** – players create their own (or the DM makes one and picks who plays it). Only the DM
  and that player can edit it. Each has a stat block, conditions and an HP tracker with damage, healing,
  temporary HP and a long-rest reset that both of them can use at the table.
- **Battle maps** – any entry with a map image can be switched into battle mode (Battle map button on the
  entry or the world map). Grid with snapping, tokens from your characters, NPCs and monsters, rulers,
  drawings and area templates, pings, doors, fog of war (painted by hand or line of sight from walls),
  an initiative tracker and HP for every token. Players get a “Join battle” banner and move their own
  tokens; hidden monsters and monster HP never reach their devices. Import a Universal VTT file
  (`.dd2vtt`, e.g. BattlemapForge's “Export for VTT”) to bring the grid, walls and doors in one go.
  Players' initiative list only shows creatures the party has seen (or that have acted); tokens show
  the character's or monster's picture; players' drawings are shared, the DM's are private until shared
  (click or right-click a drawing). Works with any map image (set the grid on top) or a `.dd2vtt` file.
  Dragging a token shows the walking distance around walls and closed doors (players can't walk
  through them); the ruler takes waypoints (right-click, Space or W; hold still on touch). Spell
  templates (sphere, cone, 5/10 ft line, cube) snap to the grid and light up the squares they catch.
  Conditions can run for 1 round / 1 minute / 10 minutes and drop off on their own; concentration
  reminders on damage; death saves at 0 HP; auras; flying height; an encounter difficulty meter
  (2024 DMG budgets) and Undo (`Ctrl/⌘ Z`) for moves, HP, doors, fog and drawings. Auras can run for
  a number of rounds or end with the concentration they came from; massive damage kills outright.
  Nothing is enforced on movement: speed is shown next to the distance, and walls only ask
  "Move anyway?" (teleports, climbing, the DM's say-so).
- **Battlemap Forge built in** – a battle map's settings (or ⋯ → *Make a battle map* on a place
  without a map) open [Battlemap Forge](https://github.com/JustusHellman/BattlemapForge) full
  screen; *Send to DnDocs* brings the map back with grid, walls and doors. *Edit this map in
  Battlemap Forge* reopens it later (tokens, drawings and fog stay). The Forge stays its own site and
  repo: DnDocs loads it from `VITE_FORGE_URL` (default `https://justushellman.github.io/BattlemapForge/`,
  the same site as DnDocs on GitHub Pages), so there is one copy of its code.
- **Battle here** – a fight breaks out in the city? On the place's world map, *Battle here* offers:
  *On this map* (the whole map is the battlefield), *On a part of this map* (drag a box; that piece is
  copied, enlarged, as a new secret place's battle map, and you pick how many squares across), or
  *At a new pin* (tap a spot, then paint its map in Battlemap Forge). The new place is an ordinary
  entry: rename, reveal or delete it like any other. Paint a proper map later and the tokens stay.
- **Grid** – set in the battle's Settings → Grid: squares across, and line it up by dragging the map
  while that tab is open (or with the sliders). Maps from Battlemap Forge / `.dd2vtt` bring their own.
- **Battle maps stay put** – after a fight the map stays on its place's entry (tokens, drawings and
  fog included): the entry's *Battle map* button, the world map, or DM tools → *Battle maps* (a list
  of all of them). Players can only open one while the DM has the battle on.
- **Storage** – a map is kept as one compressed WebP image (at most 2400 px, under 1 MB) plus its
  walls and doors as short number lists; a `.dd2vtt` file itself is never stored. A Forge map's
  editable file adds about 2 KB. Initiative ties go to the players first; the
  DM can move anyone up or down the order (↑ ↓). Big removals (a token, drawings, "fog all") show an
  Undo button. The massive-damage rule can be switched off under Members → Campaign settings.
- **World map** – double-click (or double-tap) a pin to enter that place.
- **Your own entry types** (DM → Entry types): add types like Spells or Deities with their own icon,
  colour and fields, rename the built-in ones, or hide fields you never use.
- **Writing** – a light editor that grows with the text; type `@` to link another entry (or create it on
  the spot). Every entry lists where it's **mentioned**.
- **Visibility** – Secret / some players / everyone per entry; shared players see every field except the
  ones you lock. DM-only secrets and per-player "what you know" notes.
- **Reveal** – one button when the party discovers something: share it with everyone or chosen players and
  pop it up on their screens. The **Chronicle** lists everything revealed, day by day.
- **Reading desk** – clicking anything opens it next to the page (a bottom sheet on phones). Read up to
  three entries side by side: drag a name from the shelf, a card or a column header onto a column
  (replace) or its edge (new column), or Ctrl/⌘-click. Each column has its own back/forward, the desk
  can be resized or given the whole screen.
- **Search** everywhere (`Ctrl/⌘ K` or `/`), including `#tag` search, type and location filters.
- **World map** – drill down from the world into countries, settlements and shops. Map images can be
  zoomed and panned (mouse wheel, pinch, drag); the DM places pins by tapping, drags them to move,
  and can preview the map as players see it.
- **Relationships** between entries (one record, shown from both sides), notes attached to any entry,
  location trees, and DM tools (dice roller, tavern / NPC / loot generators).
- **Offline cache and incremental sync** – the campaign is kept in the browser, so it opens instantly and
  survives bad Wi-Fi. A device that has been here in the last three days downloads only the entries and
  links that changed since its last visit (a handful of reads instead of the whole campaign); deletions
  and lost access reach it through tiny "sync hints". Every few days, after a pack import, or whenever
  something looks off it simply loads everything again. Members → *Reload campaign data* forces that.
  Member names are kept for a day. Signing out clears it all.
- **Images** are stored as WebP (JPEG on browsers without WebP) at up to 1280 px, with a tiny preview
  on each entry so lists show pictures without loading the full images.

## Run locally

Prerequisite: Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint` (type-check), `npm test` (unit tests).

### Optional: Firebase emulators

To try things without touching real campaign data, run the Firestore + Auth emulators
(`firebase emulators:start --only firestore,auth`) and start the app with:

```bash
npm run dev:emulator
```

### Optional: AI image generation (local only)

Put `GEMINI_API_KEY=...` in `.env.local`. The generator in *DM tools* only exists in local dev builds —
the key is **never** included in the production bundle. (You can remove the `GEMINI_API_KEY`
secret from the GitHub deploy workflow; it's no longer used.)

## Deploying

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

### Firestore security rules

`npm run test:rules` checks the rules against the Firestore emulator (needs Java; see `rules-tests/`).

**Incremental sync needs composite indexes** (`firestore.indexes.json`). Deploy them with
`firebase deploy --only firestore:indexes` (or create them from the links in the browser console).
Until they exist the app just loads everything, like before. The rules now require every write to an
entry or link to carry the server's time (`syncAt`), so deploy the new app and the rules together.

`firestore.rules` is **not** deployed by the workflow. The version in this repo tightens a few things:

- users can't list every account (emails were readable by anyone signed in),
- campaigns are only readable by their members,
- players join through a `joinCodes/{CODE}` lookup document instead of listing all campaigns.

Deploy the new app first, let each DM open their campaign once (that creates its join-code
document), then deploy the rules in the Firebase console or with `firebase deploy --only firestore:rules`.

Note: field-level visibility is enforced in the UI; anyone who can read an entry's document could
technically read all of its fields. Truly private DM data would need a separate DM-only collection.

## Project layout

```
src/
  contexts/     Auth, campaign data (one set of Firestore listeners), quick view, toasts, confirm dialogs
  lib/          entity type registry, permissions, Firestore service, media, search, text helpers
  components/
    layout/     app shell, sidebar, bottom nav, quick view panel, command palette
    entity/     entity view, cards, pickers, relationships, stat blocks, images
    editor/     markdown field, image manager, tag input, field visibility toggle
    map/        pan & zoom map viewer
  pages/        routed pages
```
