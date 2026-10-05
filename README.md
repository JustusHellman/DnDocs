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
- **Offline cache** – the campaign is kept in the browser, so it opens instantly, survives bad Wi-Fi and
  only downloads what changed (fewer reads on the free plan). Signing out clears it.
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
