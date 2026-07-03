# ReacTube

Paste a YouTube link, watch it here, and drop comments with **GIFs, stickers, images,
and draggable text overlays** — the comment section YouTube never gave you.

Built from [`youtube-companion-comments-buildplan.md`](./youtube-companion-comments-buildplan.md).

## Quick start (zero config)

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no API keys the app runs in **demo mode**:
auth, comments and favorites are stored in your browser's localStorage, the
curated sticker set and image uploads work, and the GIF tabs show setup hints.

## Going live (all free tiers)

1. **Supabase** — create a project at [supabase.com](https://supabase.com), open the
   SQL editor and run [`supabase/schema.sql`](./supabase/schema.sql) (tables, RLS,
   rate-limit trigger, report RPC, storage bucket).
2. **Tenor** — grab a free v2 API key at
   [developers.google.com/tenor](https://developers.google.com/tenor) for GIF
   trending + search.
3. Copy `.env.example` → `.env` and fill in the three values, restart the dev server.
4. **Deploy** — push to GitHub and import into Vercel/Netlify; add the same env
   vars in the project settings. Build command `npm run build`, output `dist`.
   Add a SPA rewrite (all routes → `/index.html`).

## Stack

React 18 + Vite + Tailwind v4 · Supabase (Postgres/Auth/Storage) · Tenor v2 ·
YouTube nocookie embed · noembed for keyless video metadata.

The text-on-media overlay is a lightweight custom pointer-drag implementation
(instead of Fabric/Konva from the plan) — positions are saved as
`{x%, y%, size(cqw), color, rotation}` so comments re-render responsively at
any size, exactly as the plan's data model intends.

## Feature checklist (MVP scope from the plan)

- [x] Paste URL → embedded player at `/watch/:youtube_id`
- [x] Shared comment thread per video
- [x] Text / media / text+media comments with draggable overlay text
- [x] Picker: Trending · Search · Stickers · Favorites · Upload (WhatsApp-export workaround)
- [x] Favorites (per user)
- [x] Auth (sign up / log in / log out)
- [x] Report comment, delete own comment, 5-per-minute rate limit (client + SQL trigger)
