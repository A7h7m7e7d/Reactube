# Build Plan: YouTube Companion Comments Site
### (Working title: "ReactTube" — rename as you like)

## 1. What this is

A website where a user pastes a YouTube video URL, watches the video embedded on your site, and posts comments in **your own** comment section underneath it. Comments can include GIFs, images, and stickers, with optional text layered on top of the media. Users get GIF/sticker suggestions (trending + search) and can save favorites.

**Important constraint to keep in mind throughout:** this comment section lives on your site only. It is not, and cannot be, injected into the real comment section on youtube.com — YouTube's API doesn't support media attachments on comments, and there's no way for a third party to add that capability to YouTube's own page. Every design decision below assumes comments are scoped to "this video, as discussed on our site."

---

## 2. Core features (MVP scope)

1. Paste a YouTube URL → video embeds and plays
2. Comment thread tied to that video (shared by all users who visit that URL)
3. Compose a comment with:
   - Text only, or
   - One image/GIF/sticker only, or
   - Text + one image/GIF/sticker, with the text rendered as a draggable overlay on top of the media
4. GIF/sticker picker with:
   - Trending/viral tab (pulled from a GIF API)
   - Search
   - Stickers tab (curated set + user favorites)
5. Favoriting GIFs/stickers (saved per user)
6. Account system: sign up, log in, log out
7. Basic moderation: report comment, delete own comment

**Explicitly out of scope for MVP** (nice-to-haves for later, noted in Section 8): replies/threading, likes, real-time live updates, custom sticker uploads, admin dashboard, mobile app.

---

## 3. Tech stack (all free-tier to start)

| Layer | Choice | Why | Free tier limit to know |
|---|---|---|---|
| Frontend | React + Vite, hosted on **Vercel** or **Netlify** | Fast, huge community, free hosting with CI/CD from GitHub | Vercel free: 100GB bandwidth/mo — plenty to start |
| Styling | Tailwind CSS | Fast to build, no license cost | — |
| Text-on-media overlay | **Fabric.js** or **Konva.js** (canvas libraries) | Lets users drag/resize text on top of an image or GIF frame client-side, free & open source | — |
| Backend | **Supabase** (Postgres + Auth + Storage, all in one) | Free tier covers DB, auth, and file storage together, avoids stitching 3 separate services | 500MB DB, 1GB file storage, 50k monthly active users on auth |
| Auth | Supabase Auth (email/password, or add Google login later) | Built into Supabase, no extra service or cost | Included above |
| Comment/media storage | Supabase Storage (for user-uploaded images) | Free tier bucket, integrates directly with Supabase DB rows | 1GB storage, 2GB egress/mo |
| GIF/sticker suggestions | **Tenor API** (Google-owned, generous free quota) or **GIPHY API** | Both free for non-commercial/low-volume use; Tenor's free quota is currently more generous | Rate-limited but ample for MVP traffic |
| YouTube video embed | YouTube **iframe Player API** | Free, no API key required just to embed and play a video | — |
| YouTube metadata (title/thumbnail, optional) | YouTube Data API v3 | Free with a Google Cloud API key | 10,000 units/day free quota — plenty for metadata lookups |

**Total monthly cost at MVP scale: $0.** You'll only start paying if you exceed these generous free quotas, which typically means you have real traction — a good problem to have, and at that point Supabase/Vercel paid tiers start around $20-25/mo each.

---

## 4. Data model (Supabase/Postgres tables)

```
users (managed by Supabase Auth)
  id, email, display_name, avatar_url, created_at

videos
  id (pk)
  youtube_id (unique, e.g. "dQw4w9WgXcQ")
  title, thumbnail_url        -- fetched once via YouTube Data API, cached
  created_at

comments
  id (pk)
  video_id (fk -> videos.id)
  user_id (fk -> users.id)
  body_text                   -- plain text portion of the comment
  media_url                   -- nullable; image/gif URL (uploaded or from Tenor/GIPHY)
  media_type                  -- enum: 'image' | 'gif' | 'sticker' | null
  overlay_text                -- nullable; the text layered on top of the media
  overlay_position             -- JSON: {x, y, fontSize, color, rotation}
  created_at
  reported_count

favorites
  id (pk)
  user_id (fk -> users.id)
  media_url
  media_type                  -- 'gif' | 'sticker'
  source                      -- 'tenor' | 'giphy' | 'sticker-library'
  created_at
```

Keeping `overlay_text` and `overlay_position` as separate fields (rather than flattening text into the image at upload time) is the recommended approach — it's cheaper (no server-side image processing needed), and lets you re-render the comment responsively at any size.

---

## 5. Page/component flow

1. **Home page** — input field: "Paste a YouTube URL" → validates and extracts the video ID → redirects to `/watch/:youtube_id`
2. **Watch page** (`/watch/:youtube_id`)
   - Left/top: embedded YouTube player (iframe API)
   - Below: comment composer + comment feed for that `youtube_id`
   - On first visit to a given `youtube_id`, backend checks if a `videos` row exists; if not, calls YouTube Data API once to fetch title/thumbnail and creates the row
3. **Comment composer** (modal or inline panel)
   - Text input
   - "Add GIF/Sticker/Image" button → opens picker
   - Picker has tabs: Trending, Search, Stickers, My Favorites
   - On selecting media, it appears in a small canvas preview where the user can type text and drag it into position (Fabric.js/Konva canvas)
   - "Post" button submits `{body_text, media_url, media_type, overlay_text, overlay_position}`
4. **Comment feed**
   - Renders each comment; if `media_url` is present, renders the media with `overlay_text` absolutely positioned on top using the saved `overlay_position` coordinates (same rendering logic as the composer preview, just non-interactive)
5. **Auth pages** — simple sign up / log in using Supabase Auth's prebuilt UI components (saves you from building this from scratch)
6. **Favorites** — small heart/star icon on any GIF/sticker in the picker; toggling it writes/deletes a row in `favorites`

---

## 6. GIF/sticker suggestion logic ("viral" content)

- **Trending tab**: call Tenor's `featured` endpoint on load — this returns Tenor's currently trending GIFs, refreshed periodically by Tenor itself, so you get "viral" content for free without building any trend-detection logic yourself
- **Search tab**: call Tenor's `search` endpoint with the user's query, debounced as they type
- **Stickers tab**: Tenor also has a stickers-specific endpoint (`searchfilter=sticker`); alternatively curate a small starter set (e.g., 50-100 stickers) stored in your own Supabase Storage bucket so you're not fully dependent on a third party for this category
- **"Import my WhatsApp stickers"**: not directly possible — WhatsApp stores a user's sticker packs locally inside its own app sandbox and doesn't expose any API for a third-party site to read them. The realistic workaround: WhatsApp lets a user export/share an individual sticker as an image file, so you can add a **"Upload custom sticker"** option in the Stickers tab where a user uploads that exported file (to Supabase Storage) and it's saved straight into their favorites. This gets them their own stickers on your site, just via manual upload rather than a live import.
- Cache trending results client-side for a few minutes to avoid hammering the API on every page load

---

## 7. Build order (suggested phases)

**Phase 1 — Skeleton (get something running)**
- Set up React + Vite + Tailwind, deploy blank app to Vercel
- Set up Supabase project (DB + Auth + Storage)
- Home page URL input → watch page with working YouTube embed

**Phase 2 — Comments (text only)**
- `comments` table, post/read text comments per video
- Auth: sign up/log in, attach `user_id` to comments

**Phase 3 — Media in comments**
- Integrate Tenor API: trending + search tabs in a picker
- Let users attach a GIF/sticker to a comment (no overlay text yet)
- Add image upload (Supabase Storage) as an alternative to GIF

**Phase 4 — Text overlay**
- Integrate Fabric.js/Konva canvas in the composer
- Save `overlay_text` + `overlay_position`, render it in the feed

**Phase 5 — Favorites & polish**
- Favorites table + "My Favorites" tab
- Report/delete comment
- Basic rate limiting (e.g., max N comments/min per user) to deter spam

Each phase is independently shippable — you'll have a usable product after Phase 3 even before overlay text exists.

---

## 8. Later / v2 ideas (not needed for MVP)

- Threaded replies and upvotes
- Custom sticker packs users can upload and share
- Real-time comment updates (Supabase has built-in Realtime subscriptions for this — easy to bolt on later)
- Google/YouTube login so display names match users' YouTube identity
- Admin/moderation dashboard for reported comments
- Browser extension that overlays your comment section directly on the youtube.com page while watching (this is technically possible via a content script, and is the closest you can get to feeling "native" — but it's a separate project from the website itself)

---

## 9. Cost summary

| Users/traffic level | Monthly cost |
|---|---|
| MVP / early testing (low hundreds of users) | **$0** — everything above fits free tiers |
| Growing (low thousands of daily active users) | Roughly $25-45/mo (Supabase Pro ~$25, Vercel Pro ~$20 if bandwidth exceeded) |
| Scaling further | Costs scale with storage/bandwidth/API calls, at which point ad revenue or a small subscription tier could offset it |

You can realistically run this for free through the entire MVP and early-growth stage.

---

## 10. Immediate next steps

1. Create free accounts: Supabase, Vercel, Tenor API (get an API key), Google Cloud (for YouTube Data API key, optional)
2. Scaffold the React app and get Phase 1 deployed
3. Once Phase 1 is live, I can help you write the actual code for each phase — happy to build components, Supabase table setup SQL, or the canvas overlay logic whenever you're ready to start implementing.
