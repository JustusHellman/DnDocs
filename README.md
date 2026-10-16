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
- **Jukebox** – background music everyone hears at the same moment. The DM picks an environment
  (tavern, forest, bustling city, chase, skirmish, battle, boss battle, epic finale, underwater…
  28 of them) from the ♫ button in the top bar or the *Jukebox* page, and DnDocs shuffles fitting
  tracks from the [DnDJukebox](https://github.com/JustusHellman/DnDJukebox) library, crossfading
  between tracks and fading smoothly when the scene changes (quick / smooth / slow). Many places have
  **Calm / Tense / Danger** levels the DM can switch without changing scene; fights and chases start
  each track where it gets going. **Stingers** (roll initiative, victory, dramatic reveal, a death…)
  play once for everyone over the music. The DM can pause, skip, stop, play a specific track, see
  what's up next, press 👎 *Doesn't fit here* (the track leaves that environment for the campaign,
  with undo), make their own environments, add or remove tracks (from the library, or any direct
  link to an audio file) and hide environments they don't use; their changes to library environments
  can be downloaded as a review file for the library repo. Players get a volume slider and mute
  (kept per device) and the track's credit. Nobody needs an account anywhere: the music is Creative
  Commons (Kevin MacLeod, incompetech.com, and Scott Buckley, scottbuckley.com.au) and is served from
  its own GitHub Pages site, loaded from `VITE_JUKEBOX_URL` (default
  `https://justushellman.github.io/DnDJukebox/`). Browsers only play sound after you've clicked
  somewhere on the page, so a player who opens DnDocs mid-song gets a one-tap *Listen* banner.
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
- **Visibility** – Secret / some players / everyone per entry. Fields are hidden until revealed, and you
  can tell one player something the others don't. DM-only secrets and per-player "what you know" notes.
- **Reveal** – one button when the party discovers something: pick who, tick what they learn (the usual
  fields are pre-ticked; stat blocks, tactics, ratings and the like stay back), and pop it up on their
  screens. Press it again later to reveal more. Each field on an entry also has a small switch to show or
  hide it on the spot. Per type, you choose which fields are pre-ticked (Entry types). The **Chronicle**
  lists everything revealed, day by day.
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
  survives bad Wi-Fi. A device that loaded everything within the last week downloads only the entries
  that changed since its last visit (a handful of reads instead of the whole campaign); deletions and
  lost access reach it through tiny "sync hints". Once a week, after a large pack import or removal, or
  whenever something looks off it simply loads everything again. Members → *Reload campaign data*
  forces that. Member names are kept for a day. Signing out clears it all.
- **Links in bundles** – all links between entries live in a few shared documents per campaign
  (`linkBundles`), so loading every link costs at most 8 reads and importing hundreds of links a few
  writes. Older campaigns are moved over automatically the first time the owner opens them after the
  new security rules are deployed (until then everything keeps working the old way).
- **Campaign packs** (DM tools) – import a whole set of entries from a JSON file. Importing the same pack
  again only writes what's new or changed (the preview shows how many writes it will take), so editing a
  pack and re-importing it is cheap. Choose "Update them to match the pack" to make the campaign follow
  the edited file (text, fields, location, links; optionally deleting entries the file dropped) while
  keeping reveals, images and your own links. That's far cheaper than removing and re-importing.
- **Scavenger's Codex** (sidebar) – the [Scavenger's Codex](https://github.com/JustusHellman/ScavengersCodex)
  runs inside DnDocs and saves to the campaign instead of the browser: one shared party satchel (with
  its clock, workbench, garden and journal) that everyone sees change live, plus each player's own
  satchel, private to them and the DM. Two players adding loot at once both count. DnDocs says who the
  DM is, so the Codex needs no PIN. Homebrew the DM picks or adds in the Codex applies to the whole
  campaign.
  - Monster and item entries can link to their Codex creature or item (DnDocs suggests the one with
    the same name). They then open in the Codex, and revealing the entry adds it to the party's
    Codex journal.
  - On a battle map, *Add tokens → From the Codex* puts any Codex creature on the map without a
    DnDocs entry, with its SRD hit points and the Codex's picture for its kind of creature. The token
    card shows its full SRD stat block to the DM and to whoever controls the token (a beast master's
    companion); exact HP stays with the DM. *Codex* in a token's Picture row gives any Codex-linked
    token that picture.
    *Harvest the fallen* sends the defeated to the Codex's after-the-fight panel.
  - Monster and NPC entries get *Fill from the SRD* in the editor: the stat block of the linked Codex
    creature (or the SRD creature with the same name), editable afterwards. A linked entry without a
    stat block of its own also uses the SRD one on the battle map.
  - Coin lives in the Codex too: each player's purse and the party purse. Players can **give** items
    or coin to each other (*Give…* in the Codex satchel); a gift waits in the receiver's inbox and is
    put in their satchel as soon as they have DnDocs open.
  - The DM is the bank: in the Codex's DM tools (*Hand out*, and the trader) the DM gives and takes
    items and coin for the party or any player, and sees what every player carries. Item entries linked to the
    Codex also get *Give to…* (DM), which puts the item straight into a player's or the party's satchel.
  - **Unidentified and cursed items:** when the DM gives a magic item to a player in the Codex, it can
    go *unidentified* (the player sees only how it looks, like "Unidentified ring · Rare") and/or with
    a *curse* the DM types. What the item really is and any hidden curse are kept in
    `codex/{campaign}/secrets/unid`, which only DMs can read, so they never reach the player's device.
    DM tools → *Hand out* → *Unidentified & cursed* has *Identify*, *Reveal curse*, *Take back* and
    *Lift curse*. (Needs the current `firestore.rules`.)
  - A player character's page shows what that player carries in the Codex (satchel and purse) under
    *Carried*, with *Open my satchel*. Only the player and the DM see it. Item entries the DM placed
    on the character are listed there too.
  - Inside DnDocs the Codex keeps its own sidebar and search (it's a tool you open) but takes on
    DnDocs' parchment look.
  - One rule for items: what someone carries lives in the Codex satchels. A DnDocs item entry linked
    to the Codex is its page (lore, pictures, secrets) and shows who carries it; it can't be placed on
    a character, only somewhere nobody carries it (a chest, a shop). *Make a DnDocs page* in the Codex
    (DM) creates such a page. Unique items with no Codex version are placed like any other entry.
  - Sharing a recipe: *Teach the party* on a Codex formula (DM) teaches everyone at once; handout
    links and QR codes open DnDocs and unlock for the whole party; *Post as a handout in DnDocs*
    makes a note for everyone or chosen players (optionally shown on their screens).
  - The Codex runs in a sandboxed frame, so it can't read your DnDocs sign-in.
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

The jukebox adds a `jukebox/{campaignId}` document (everyone in the campaign reads it; only DMs
write it). Deploy the rules after the app, or players won't hear the music.

Link bundles add `linkBundles/{campaignId}__{n}` documents. Deploy the app, then the rules; the next
time the owner opens a campaign its links are moved into bundles automatically (until the rules are
deployed that move is refused and everything keeps working the old way).

The Scavenger's Codex adds `codex/{campaignId}` (the party: everyone in the campaign reads and
writes it; only DMs change which homebrew is in play), `codex/{campaignId}/satchels/{uid}` (a
player's own satchel and purse: theirs and the DM's), `codex/{campaignId}/satchels/{uid}/inbox/{id}`
(gifts: anyone in the campaign can leave one, signed with their own uid; only the receiver and the
DM can read or take them; the party document also holds the party's goals) and `codex/{campaignId}/packs/{name}` (the DM's homebrew).
Deploy the rules with the app, or the Codex can't save.

### Table chat and dice (Realtime Database)

The chat and dice rolls use Firebase's **Realtime Database**, not Firestore, so they never count
against the Firestore read/write limits (the free plan's Realtime Database is limited by data stored
and downloaded instead, and a chat line is a few hundred bytes). One-time setup:

1. Firebase console → Build → **Realtime Database** → Create database (any location; start in
   **locked mode**).
2. Copy its URL (e.g. `https://<project>-default-rtdb.europe-west1.firebasedatabase.app`) into
   `firebase-applet-config.json` as `"databaseURL"`.
3. Paste `database.rules.json` into the database's **Rules** tab and Publish (or
   `firebase deploy --only database`).
4. Deploy the app and open the campaign once as its owner: that registers the room and its member
   list (new players are added the next time the owner's app is open).

Without a `databaseURL` the chat still works as a local dice roller. DM rolls are hidden from the
players by default (they see "rolls behind the screen"); the DM can switch that in the chat header.

User profiles can no longer be given a `role` by their owner (an `admin` role used to be
self-assignable). Set roles in the Firebase console.

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
    jukebox/    music button, now playing, volume, environment picker
  lib/jukebox/  play order (shared shuffle + clock), audio engine with fades, library + DM changes
  pages/        routed pages
```
