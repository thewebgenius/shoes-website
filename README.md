# StrideHaus: 3D shoe showroom (MVP)

A shoe store website. The shopkeeper adds a shoe in the admin panel and approves it. Customers can then explore it in an interactive 3D showroom, read and write reviews, try it on visually and find similar shoes from a photo.

> Store name, address, phone and opening hours in `src/config/site.ts` are **placeholders**. Replace them before going live.

## What is in the MVP

| Area | What it does |
| --- | --- |
| Public site | Home, 3D Showroom (Men / Women / Kids glass cases), category pages, product page with 3D viewer, Try-On Lab, Find My Shoe, About, Privacy, Terms |
| 3D | Real GLB models rendered with three.js / React Three Fiber. Supports rotate, zoom, auto-rotate, reset and full screen, with mouse and touch input. Models load lazily and a poster image is shown first. |
| Admin (`/admin`) | Login and add/edit products. Upload a shoe photo: the original is kept privately and AI background removal runs in the background (Photoroom). A vision model (Claude) suggests metadata that the shopkeeper uses, edits or rejects field by field. Upload a GLB (or, for development, assign a sample model). From the preview: Approve, then Publish, or Reject; later unpublish, archive or restore. Also review moderation, an analytics dashboard and an audit log (admin only). |
| Lifecycle | Draft → Processing → AI ready → Needs review → Approved → Published. Nothing is ever published automatically: submitting needs a processed image, a 3D model and staff-verified metadata, and approving and publishing are separate clicks. |
| Reviews | 1–5 stars, a display name and text. Shows the average, count, distribution and a "helpful" button. Moderation uses a honeypot, a timing token, duplicate detection, a rate limit and abusive-language/spam screening. Every review waits for admin approval. |
| Try-On Lab | Upload a photo once (feet only, lower body or full body), then generate a footwear try-on for any shoe with FASHN Try-On Max, and switch shoes without uploading again. Every result carries "AI visual preview. Results may vary from the actual appearance and fit." The photo and previews are private, encrypted at rest and deleted automatically. |
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
| `IMAGE_ENHANCEMENT_PROVIDER`, `IMAGE_ENHANCEMENT_API_KEY` | Background removal: `photoroom` + your Photoroom key |
| `METADATA_PROVIDER`, `METADATA_API_KEY`, `METADATA_MODEL` | Metadata suggestions: `anthropic` + your Anthropic key (model defaults to `claude-sonnet-5-5`) |
| `TRYON_PROVIDER`, `VIRTUAL_TRYON_API_KEY` | Virtual try-on: `fashn` + your FASHN key |
| `TRYON_RESOLUTION` | Size of the generated try-on photo: `1k`, `2k` (HD, default) or `4k` |
| `EMBEDDING_PROVIDER` | Find My Shoe similarity: `local` (default, not AI) or `http` |
| `AI_ALLOW_MOCK_PROVIDERS` | Testing only: without it every `*_PROVIDER=mock` or `local` setting is ignored and shows "AI provider not configured" |
| `MAX_IMAGE_UPLOAD_MB`, `MAX_MODEL_UPLOAD_MB` | Upload limits |
| `TRYON_RESULT_TTL_MINUTES` | Minutes a customer try-on photo and its previews are kept (default 30) |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (run `npx next typegen` first on a fresh clone) |
| `npm test` | Unit tests (Vitest): AI provider adapters and error handling, registry/“not configured”, retry policy, secrets, moderation, RBAC, passwords, upload/GLB validation, embeddings |
| `npm run test:e2e` | Playwright end-to-end tests on desktop, mobile (Pixel 7) and tablet (iPad) |
| `npm run db:generate` | Generate a new migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed demo catalogue |
| `npm run assets:models` / `assets:render` | Rebuild the sample GLB models / their preview images |

### Running the end-to-end tests

The E2E tests start two `next start` servers against the database in your env and create and archive their own test products:

- port 3100 runs the whole workflow with the **development mocks** switched on explicitly (`*_PROVIDER=mock`, `AI_ALLOW_MOCK_PROVIDERS=true`), and checks every result is labelled "development mock, not AI";
- port 3101 runs with **no AI configured** and checks every AI feature says "AI provider not configured" with no fake result.

No E2E test calls a paid provider.

```bash
set -a; source .env.local; set +a
npm run build
npx playwright test                 # all devices
npx playwright test --project=mobile
```

They need a Chromium that can do WebGL (SwiftShader flags are set in `playwright.config.ts`). Set `PW_CHROMIUM` to point at a specific browser binary.

## AI providers

### What is integrated

| Capability | Provider | API (checked against the official docs, Oct 2026) | Where |
| --- | --- | --- | --- |
| Background removal for product photos | **Photoroom** Image Editing API | `POST https://image-api.photoroom.com/v2/edit` with `x-api-key`; `removeBackground`, `padding=0.1`, `outputSize=1200x1200`, `export.format=png`, no background colour (transparent). No generative effects (shadows, relighting) are requested, so the shoe's pixels are the real shoe's. | `src/server/ai/providers/photoroom.ts` |
| Product metadata | **Claude vision** (Anthropic Messages API) | `POST https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`; the original photo and the cutout are sent as images, and a forced tool call returns structured JSON. | `src/server/ai/providers/anthropic.ts` |
| Virtual try-on with shoes | **FASHN Try-On Max** | `POST https://api.fashn.ai/v1/run` (`model_name: "tryon-max"`) then poll `GET /v1/status/{id}`; `Authorization: Bearer`. Try-On Max supports shoes as well as clothing. Images go as base64 data URIs with `return_base64: true`. | `src/server/ai/providers/fashn.ts` |
| Find My Shoe | Local colour/shape features | Not AI, and labelled so. Swap in an embedding service with `EMBEDDING_PROVIDER=http`. | `src/server/ai/local/providers.ts` |
| Review moderation | Local word and link rules | Not AI, and labelled so. Every review still waits for a person. | `src/server/security/moderation.ts` |
| Photo-to-3D | Not configured | `ThreeDGenerationProvider` is kept for a future service (`THREE_D_PROVIDER=http`). Upload GLBs meanwhile. | `src/server/ai/providers/http.ts` |

Why Photoroom and not remove.bg: remove.bg's self-service API stops accepting requests on 1 December 2026 (it is moving into Canva), so building on it now would break within weeks.

### Getting the keys

1. **Photoroom**: create an account at <https://www.photoroom.com/api>, open the API dashboard and copy the key. A key starting with `sandbox_` is free (watermarked results, about 100 calls a day) and is ideal for a first test; the admin page warns when a sandbox key is used.
2. **Anthropic**: <https://console.anthropic.com> → API keys. Add a little credit under Billing.
3. **FASHN**: sign up at <https://fashn.ai>, open the API section of the dashboard (docs: <https://docs.fashn.ai>) and create a key; buy credits (minimum 100 credits, $0.075 each on demand at the time of writing). Commercial use is allowed on the API plans.

Put them in `.env.local` (never in Git):

```bash
IMAGE_ENHANCEMENT_PROVIDER=photoroom
IMAGE_ENHANCEMENT_API_KEY=<your Photoroom key>
METADATA_PROVIDER=anthropic
METADATA_API_KEY=<your Anthropic key>
TRYON_PROVIDER=fashn
VIRTUAL_TRYON_API_KEY=<your FASHN key>
```

Restart `npm run dev` (or `npm start`) after changing them. In production set the same variables in your host's secret store.

### Costs and how the app limits them

- **Photoroom**: one Image Editing call per new photo. The same photo uploaded twice for a shoe is detected by its SHA-256 hash and not sent again; "Retry processing" is a deliberate click.
- **Claude**: one call per processed photo (about 2 images + a short prompt).
- **FASHN**: `balanced` mode at `2k` (HD) resolution per preview by default; `TRYON_RESOLUTION=1k` is cheaper and `4k` costs more. A preview is generated only when the customer clicks Generate; the same photo and shoe in one visit reuse the earlier result. Try-on is rate limited (10 generations and 20 photo uploads per visitor per hour).
- Photos are compressed before sending: product photos to ≤2500 px JPEG, customer photos to ≤2560 px, metadata images to ≤1280 px.

### How each flow works

**Shopkeeper photo → product image**

1. Upload. The file is checked (type, magic bytes, full decode, size, dimensions), re-encoded (EXIF removed) and stored privately as the **original**, which is never overwritten.
2. A job is queued and the request returns immediately. The job runs in the background (`after()`), calls Photoroom with a 60 s timeout and up to 2 retries for rate limits, timeouts and 5xx errors. Bad keys, empty credit and rejected photos fail at once.
3. The result is checked (it must be an image and must actually be transparent), stored as 400/800/1200 WebP plus a tight cutout, and becomes the primary image.
4. Claude suggests metadata and also compares the cutout with the original. If it sees a hand, floor or a missing part, the job becomes **Needs review** with the reason.
5. The admin page refreshes itself while jobs run and shows exactly one of: Queued, Processing…, Retrying…, AI processing completed, AI processing completed · needs review, AI processing failed (with Retry processing), or AI provider not configured.

**Metadata**

Claude returns `shoeType`, `category` (men/women/kids), `gender`, `color`, `secondaryColors`, `style`, `description`, `brand`, `model`, a confidence per field, `needsVerification` and `cutoutIssues`. Brand and model stay empty unless the confidence is at least 0.8. Values under 0.6 show "Needs verification". The shopkeeper can **Use**, **Reject** or enter a **Custom value** for each field, and must tick "I have checked these details" before the product can be submitted.

**Customer try-on**

1. The customer agrees to the terms and uploads a photo once. It is validated, re-encoded, compressed and stored **encrypted** (AES-256-GCM) under a random file name. Only the browser that uploaded it can use it (HttpOnly cookie holding a random token; only its hash is stored).
2. They pick a shoe and click Generate. The server sends the photo and the shoe image to FASHN as base64 in the request body, never as a URL, with a prompt to change only the footwear and keep the framing, identity, pose, clothing and background. So a feet-only photo stays feet-only, and a full-body photo stays full-body.
3. The page polls the job: Generating try-on → Completed, or Failed with Retry. They can pick another shoe and generate again without uploading.
4. Every result says: "AI visual preview. Results may vary from the actual appearance and fit." There are no size or fit claims.
5. "Delete my photo now" removes the photo and every preview immediately; otherwise everything is deleted after `TRYON_RESULT_TTL_MINUTES` by the housekeeping timer.

### Privacy

- Keys are read only on the server (`src/server/env.ts`), never sent to the browser, and never logged. Provider errors are logged as one line with the provider, error code, HTTP status and attempt; never the body, the image or the key.
- Customer photos: private storage, random names, encrypted at rest, cookie-gated access, automatic deletion, never used for training. FASHN deletes base64 inputs when the request finishes, keeps base64 outputs for 60 minutes, and does not train on customer content unless the account opts in. Photoroom states it does not save images processed through its API. Anthropic does not train on API data by default.
- Customers see friendly messages; the admin sees the precise reason (for example "The AI provider rejected the API key").

### Not configured, and development mocks

- With no provider set, every AI feature shows **"AI provider not configured"** and nothing is faked: uploads are kept but not processed, no suggestions or confidence appear, and the Try-On Lab says try-on isn't available.
- For offline development you can opt in to mocks by name: `IMAGE_ENHANCEMENT_PROVIDER=mock`, `METADATA_PROVIDER=mock`, `TRYON_PROVIDER=mock`. Every mock result is labelled **"Development mock (not AI)"**. Mocks are refused in every environment unless `AI_ALLOW_MOCK_PROVIDERS=true` is also set (only the E2E suite sets this), so an old mock line in `.env.local` can never bring the overlay back.
- The old value `local` still means `mock`.

### Architecture

```
React components ──fetch──▶ route handlers / server actions ──▶ services ──▶ aiProviders() (registry.ts)
                                                                      │            ├─ Photoroom / Claude / FASHN adapters
                                                                      │            ├─ generic HTTPS adapters (*_PROVIDER=http)
                                                                      │            ├─ not-configured providers (default)
                                                                      │            └─ development mocks (explicit only)
                                                                      └─ ai_processing_jobs / tryon_sessions (status, attempts, errors)
```

Interfaces (`src/server/ai/types.ts`): `ImageEnhancementProvider`, `MetadataSuggestionProvider` (vision metadata), `VirtualTryOnProvider`, `ThreeDGenerationProvider`, `EmbeddingProvider`, `ModerationProvider`. Shared helpers: `errors.ts` (structured error codes and safe messages) and `resilience.ts` (timeouts, retries, size caps). Providers are never called from React components.

The generic `http` adapters accept this JSON contract (POST, `Authorization: Bearer <key>`), for a gateway in front of any other vendor:

```
enhancement  { image }                                    -> { processed, cutout, steps?, warnings? }
metadata     { image, original? }                         -> MetadataSuggestion
3d           { images[], productName }                    -> { glb }
tryon        { personImage, productImage, productName }   -> { image }
embedding    { image }                                    -> { embedding: number[512], model }
```

### Verifying with real keys

The automated tests check our side of each integration against the documented request and response formats, and one test calls the real Anthropic API with a deliberately invalid key to check the error handling. They cannot judge the providers' output quality. After adding keys:

0. Run `npm run ai:check`. It makes one free, read-only request per provider and prints OK or the exact problem, without printing any key.

1. Admin → Add product → upload a real photo (for example a shoe held in a hand on a floor). Expect "AI processing completed" and a clean transparent cutout, or "needs review" with the reason.
2. Check the metadata suggestions show "AI suggestions · Source: Claude vision (…)".
3. Publish a test shoe, open the Try-On Lab and try a feet-only photo, a lower-body photo and a full-body photo. Check that the framing is kept and that switching shoes needs no new upload.

### Troubleshooting

| You see | Meaning and fix |
| --- | --- |
| "AI provider not configured" | The `*_PROVIDER` or the key is missing. Check `.env.local` and restart the server. |
| "The AI provider rejected the API key" | Wrong or revoked key. Copy it again from the provider dashboard. |
| "…has run out of credits" | Top up the Photoroom, Anthropic or FASHN account. |
| "The AI provider is busy" / Retrying… | Rate limit or a temporary outage; the app retries twice automatically, then shows Retry. |
| Watermark on product images | You are using a Photoroom `sandbox_` key. Use a live key. |
| Metadata "model … not found" | `METADATA_MODEL` names a model your Anthropic account can't use; remove it to use the default. |
| Try-on preview shows no shoes | The customer photo does not show the feet (for example a waist-up selfie). Use a feet-only, lower-body or full-body photo. |
| A job stays "Processing…" after a restart | Jobs interrupted by a restart are marked failed after 15 minutes; click Retry processing. |
| "Development mock (not AI)" anywhere | A `*_PROVIDER=mock` is set together with `AI_ALLOW_MOCK_PROVIDERS=true`. Remove both. |

## Security summary

- argon2id password hashing. Login is rate limited per account and per IP, with a 15-minute lockout after 5 failures and generic error messages.
- Server-side sessions: random token, only its SHA-256 stored, httpOnly + SameSite=Strict cookie, 12 h absolute and 2 h idle expiry. "Sign out everywhere" is supported.
- RBAC (`admin`, `shopkeeper`) is enforced in every server action and API route. `proxy.ts` only redirects; authorisation lives in the data layer.
- Origin checks on state-changing APIs, and Postgres-backed rate limits on reviews, votes, try-on, visual search, analytics and uploads.
- Uploads are validated by content (magic bytes plus a full decode) and re-encoded, which strips EXIF. GLBs are parsed and limited in size and triangle count, and external URIs are rejected.
- CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP, and HSTS when `HTTPS=true`. Admin pages are `no-store` and `noindex`.
- Audit log of every admin action. Try-on photos and previews are encrypted at rest under random names, readable only with the uploader's HttpOnly cookie, and deleted automatically.
- AI provider keys stay on the server; a unit test scans the production browser bundle for key names and values.

## Production deployment

1. Provision Postgres with pgvector and run `CREATE EXTENSION vector;` once as a superuser.
2. Set env vars in your host's secret store: `NODE_ENV=production`, a real `APP_SECRET`, `APP_URL=https://your-domain`, `HTTPS=true`, plus `TRUST_PROXY=true` if behind a load balancer, and the three AI provider keys (see "Getting the keys").
3. `npm ci && npm run build && npm run db:migrate`, then `npm start` (or run behind a process manager or container).
4. Create staff accounts with `npm run user:create`. Do not run the demo seed in production unless you want the sample catalogue.
5. Point `STORAGE_DIR` at a persistent volume, outside the web root, and back it up with the database. For multiple instances, implement `StorageProvider` (`src/server/storage/index.ts`) for object storage.
6. Terminate TLS at a reverse proxy or platform, and put a body-size limit of at least `MAX_MODEL_UPLOAD_MB` on upload routes.
7. Housekeeping (expired try-on photos and results, sessions and rate-limit rows) runs every 5 minutes from `src/instrumentation.ts`.
8. Background AI jobs run after the response with `after()`. Stop the server with SIGTERM/SIGINT so in-flight jobs can finish.

## MVP vs Phase 2

**In the MVP:** everything in the table at the top, with the real AI providers described above.

### How background removal keeps white shoes

(This applies to the development mock and the seed script only; real uploads use
Photoroom.) Colour alone cannot separate a white sole from a white backdrop, so the local
processor also builds a Sobel edge map and refuses to let the background fill
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

**Phase 2 (not built):** photo-to-3D generation, a learned image embedding for Find My Shoe, a persistent job queue for multi-instance deployments, object storage/CDN for media, and multi-store support. E-commerce (cart, checkout, inventory), advanced 3D (AR, configurators) and BI tooling are out of scope.

## 3D model licences

- `khronos-shoe-*`: “Materials Variants Shoe” © 2021 Shopify, via Khronos glTF-Sample-Assets, **CC BY 4.0**. The attribution is shown on product pages that use it. The source is in `seed-assets/vendor/`.
- All other sample models (`aero-runner-*`, `court-classic-*`, `chelsea-*`, `kids-*`, etc.): original parametric models generated by `scripts/assets/generate-shoe-models.ts` for this project, **CC0**.

The licence and attribution for each model are stored on its `product_3d_assets` row.
