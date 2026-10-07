# StrideHaus: 3D shoe showroom (MVP)

A shoe store website. The shopkeeper adds a shoe in the admin panel and approves it. Customers can then explore it in an interactive 3D showroom, read and write reviews, try it on visually and find similar shoes from a photo.

> Store name, address, phone and opening hours in `src/config/site.ts` are **placeholders**. Replace them before going live.

## What is in the MVP

| Area | What it does |
| --- | --- |
| Public site | Home, 3D Showroom (Men / Women / Kids glass cases), category pages, product page with 3D viewer, Try-On Lab, Find My Shoe, About, Privacy, Terms |
| 3D | Real GLB models rendered with three.js / React Three Fiber. Supports rotate, zoom, auto-rotate, reset and full screen, with mouse and touch input. Models load lazily and a poster image is shown first. |
| Admin (`/admin`) | Login and add/edit products. Upload a raw photo, which goes through the processing pipeline. Verify the metadata, then upload a GLB or assign a sample model. From the preview you can Approve & publish or Reject, and later unpublish, archive or restore. Also review moderation, an analytics dashboard and an audit log (admin only). |
| Approval | Nothing is public until it is approved. Submitting needs a processed image, a 3D model and staff-verified metadata. |
| Reviews | 1–5 stars, a display name and text. Shows the average, count, distribution and a "helpful" button. Moderation uses a honeypot, a timing token, duplicate detection, a rate limit and abusive-language/spam screening. Every review waits for admin approval. |
| Try-On Lab | Upload a photo, pick a shoe, drag it onto your feet and set its size, then get a result labelled "AI-generated visual preview". The photo is kept in memory only. The result is private, needs a token and is deleted automatically (TTL) or on request. |
| Find My Shoe | Upload a photo, which is embedded and searched with pgvector (cosine HNSW). Returns the top 5 "visually similar shoes", or says plainly that nothing matched when the photo is not a shoe (see the confidence gate below). |
| Analytics | Tracks product views, 3D interactions, try-on starts and completions, visual searches and reviews. The dashboard lists most viewed, most tried-on, most searched and highest-rated shoes. |

## Stack

- Next.js 16 (App Router, Cache Components, `proxy.ts`), React 19 and TypeScript
- PostgreSQL 16 with **pgvector**, using Drizzle ORM and drizzle-kit migrations
- three.js, @react-three/fiber and @react-three/drei; @gltf-transform for GLB validation
- sharp for image processing, @node-rs/argon2 (argon2id) for passwords and zod for validation
- Tailwind CSS v4
- Vitest for unit tests and Playwright for end-to-end tests

## Setup

Prerequisites: Node 20+ and PostgreSQL 15+ with the pgvector extension available.

```bash
# 1. Install
npm ci

# 2. Database (example for a local Postgres; on Debian/Ubuntu: apt install postgresql-16-pgvector)
sudo -u postgres psql -c "CREATE USER shoe WITH PASSWORD 'change-me';"
sudo -u postgres psql -c "CREATE DATABASE shoe OWNER shoe;"
sudo -u postgres psql -d shoe -c "CREATE EXTENSION IF NOT EXISTS vector;"   # needs superuser once

# 3. Environment
cp .env.example .env.local
# edit DATABASE_URL, and set APP_SECRET:  openssl rand -base64 48

# 4. Migrations and seed data (19 shoes, sample reviews, an admin user)
npm run db:migrate
npm run db:seed
```

The seed signs in as `SEED_ADMIN_EMAIL`. If `SEED_ADMIN_PASSWORD` is empty, a strong password is generated and printed once.

To add more staff accounts:

```bash
STAFF_PASSWORD='…' npm run user:create -- --email=staff@example.com --name="Sam" --role=shopkeeper   # or --role=admin
# leave STAFF_PASSWORD unset to generate one
```

## Environment variables

All variables are documented in `.env.example`. Secrets live only in `.env.local` or your host's secret store, never in Git or client code.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `APP_URL` | Public origin, used for origin/CORS checks |
| `ALLOWED_ORIGINS` | Extra allowed origins (comma-separated); empty means same-origin only |
| `APP_SECRET` | ≥32 random chars. Used to HMAC IPs and sign tokens. The app refuses to start in production with a placeholder. |
| `STORAGE_DIR` | Upload directory, outside `public/`. Private files are only served through authorised routes. |
| `HTTPS` | `true` behind HTTPS. Turns on `__Host-`/Secure cookies and HSTS. |
| `TRUST_PROXY` | `true` only behind a reverse proxy you control (trusts `X-Forwarded-For`) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Used only by `npm run db:seed` |
| `*_PROVIDER`, `*_API_URL`, `*_API_KEY` | AI provider selection (see below) |
| `MAX_IMAGE_UPLOAD_MB`, `MAX_MODEL_UPLOAD_MB`, `TRYON_RESULT_TTL_MINUTES` | Limits |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (run `npx next typegen` first on a fresh clone) |
| `npm test` | Unit tests (Vitest): moderation, RBAC, passwords, upload/GLB validation, embeddings |
| `npm run test:e2e` | Playwright end-to-end tests on desktop, mobile (Pixel 7) and tablet (iPad) |
| `npm run db:generate` | Generate a new migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed demo catalogue |
| `npm run assets:models` / `assets:render` | Rebuild the sample GLB models / their preview images |

### Running the end-to-end tests

The E2E tests start `next start` on port 3100 against the database in your env, and create and archive their own test products.

```bash
set -a; source .env.local; set +a
npm run build
npx playwright test                 # all devices
npx playwright test --project=mobile
```

They need a Chromium that can do WebGL (SwiftShader flags are set in `playwright.config.ts`). Set `PW_CHROMIUM` to point at a specific browser binary.

## AI providers: MVP mocks and real integrations

Every AI capability sits behind an interface in `src/server/ai/types.ts`, and `src/server/ai/registry.ts` picks the implementation from env. The mocks implement the same interfaces as the real adapters, so swapping one in needs no other code change. The admin UI always shows which provider produced a result and whether it is a mock.

| Capability | Default (MVP) | What the default really does |
| --- | --- | --- |
| Image enhancement (`IMAGE_ENHANCEMENT_PROVIDER=local`) | `local-basic-v1` | Removes plain backgrounds by edge-aware segmentation, normalises, sharpens, upscales with Lanczos, then crops and resizes to transparent 400/800/1200 WebP. **Not AI**. It never invents pixels, so the real shoe is preserved. |
| Metadata suggestions (`METADATA_PROVIDER=local`) | Local heuristics | Colour from pixels plus a low-confidence shoe-type guess. Category and gender are left empty, so the UI shows **Needs verification**. |
| 3D generation (`THREE_D_PROVIDER=mock`) | Unavailable | Photo-to-3D is Phase 2. Models are uploaded by the admin, or a sample model is assigned. Labels distinguish *Store-uploaded*, *AI-generated* and *Studio sample* models. |
| Virtual try-on (`TRYON_PROVIDER=mock`) | Overlay mock | Composites the product cutout at the position and size the customer dragged it to, with the banner "AI-generated visual preview · DEVELOPMENT MOCK". It does not reshape the shoe to a foot: there is no try-on model, and the customer places it because nothing here finds feet. A real provider receives the same `placement` as a hint and may ignore it. |
| Embeddings (`EMBEDDING_PROVIDER=local`) | `local-features-v1` | 512-d colour, shape and HOG features. Good enough to rank the seeded catalogue; replace with a vision embedding model for real photos. |

**To connect a real service**, set `<NAME>_PROVIDER=http` with `<NAME>_API_URL` (HTTPS required in production) and `<NAME>_API_KEY`. The generic adapters in `src/server/ai/http/providers.ts` expect this JSON contract (POST, `Authorization: Bearer <key>`):

```
enhancement  { image }                                    -> { processed, cutout, steps?, warnings? }
metadata     { image }                                    -> { shoeType, color, category, gender, description: {value, confidence} }
3d           { images[], productName }                    -> { glb }
tryon        { personImage, productImage, productName }   -> { image }
embedding    { image }                                    -> { embedding: number[512], model }
```

Either put a thin gateway in front of a vendor that speaks this contract, or replace the body of the matching class. If you change embedding models, re-embed existing product images (the vector column is 512-d).

## Security summary

- argon2id password hashing. Login is rate limited per account and per IP, with a 15-minute lockout after 5 failures and generic error messages.
- Server-side sessions: random token, only its SHA-256 stored, httpOnly + SameSite=Strict cookie, 12 h absolute and 2 h idle expiry. "Sign out everywhere" is supported.
- RBAC (`admin`, `shopkeeper`) is enforced in every server action and API route. `proxy.ts` only redirects; authorisation lives in the data layer.
- Origin checks on state-changing APIs, and Postgres-backed rate limits on reviews, votes, try-on, visual search, analytics and uploads.
- Uploads are validated by content (magic bytes plus a full decode) and re-encoded, which strips EXIF. GLBs are parsed and limited in size and triangle count, and external URIs are rejected.
- CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP, and HSTS when `HTTPS=true`. Admin pages are `no-store` and `noindex`.
- Audit log of every admin action. Try-on photos are never stored. Results are private, need a token and expire.

## Production deployment

1. Provision Postgres with pgvector and run `CREATE EXTENSION vector;` once as a superuser.
2. Set env vars in your host's secret store: `NODE_ENV=production`, a real `APP_SECRET`, `APP_URL=https://your-domain`, `HTTPS=true`, plus `TRUST_PROXY=true` if behind a load balancer.
3. `npm ci && npm run build && npm run db:migrate`, then `npm start` (or run behind a process manager or container).
4. Create staff accounts with `npm run user:create`. Do not run the demo seed in production unless you want the sample catalogue.
5. Point `STORAGE_DIR` at a persistent volume, outside the web root, and back it up with the database. For multiple instances, implement `StorageProvider` (`src/server/storage/index.ts`) for object storage.
6. Terminate TLS at a reverse proxy or platform, and put a body-size limit of at least `MAX_MODEL_UPLOAD_MB` on upload routes.
7. Housekeeping (expired try-on results, sessions and rate-limit rows) runs every 5 minutes from `src/instrumentation.ts`.

## MVP vs Phase 2

**In the MVP:** everything in the table at the top, with mock-first AI as described.

### How background removal keeps white shoes

Colour alone cannot separate a white sole from a white backdrop, so the local
provider also builds a Sobel edge map and refuses to let the background fill
cross an outline. The result is written on a **transparent** canvas, and pages
put a soft `studio` gradient behind it, so pale shoes keep their shape instead
of dissolving into a white tile. `npx tsx scripts/dev/seg-check.ts <out-dir> <image...>`
renders cutouts on grey to check this when the pipeline changes.

### The visual-search confidence gate

Any photo has a nearest neighbour in the catalogue, so returning the top 5
unconditionally presents noise as a result: a photo of a face came back as a
ranked list of shoes. `visual-search.ts` now requires the best match to score at
least `MIN_SIMILARITY` (0.8) **and** to beat the runner-up by `MIN_MARGIN`
(0.06). Otherwise the page says nothing matched and suggests a better photo.
Calibrate the two constants with `npx tsx scripts/dev/sim-check.ts <image...>`
after changing the embedding provider; a stronger model will want different
numbers, and until then a real-world photo of a shoe can fall below the gate.

**Phase 2 (not built):** a real AI background-removal/upscaling model, a vision model for metadata, photo-to-3D generation, a real virtual try-on model, a learned image embedding, object storage/CDN for media, and multi-store support. E-commerce (cart, checkout, inventory), advanced 3D (AR, configurators) and BI tooling are out of scope.

## 3D model licences

- `khronos-shoe-*`: “Materials Variants Shoe” © 2021 Shopify, via Khronos glTF-Sample-Assets, **CC BY 4.0**. The attribution is shown on product pages that use it. The source is in `seed-assets/vendor/`.
- All other sample models (`aero-runner-*`, `court-classic-*`, `chelsea-*`, `kids-*`, etc.): original parametric models generated by `scripts/assets/generate-shoe-models.ts` for this project, **CC0**.

The licence and attribution for each model are stored on its `product_3d_assets` row.
