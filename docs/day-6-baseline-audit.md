# Day 6 Baseline Audit

Audit date: 2026-10-14. This is the read-only starting snapshot before Day 6 verification changes.

## Git baseline

- Branch: `main`.
- HEAD: `0dcadc49bd2a5763503dd522fdf19a73417b50e2` (`feat: complete day 5 recommendations and analytics`).
- `origin/main`: same commit; `git rev-list --left-right --count main...origin/main` returned `0 0`.
- `git status --short --branch`: `## main...origin/main`; porcelain status was empty.
- `git tag --list`: no tags exist at baseline, including no `v1.0.0`.
- The recent history contains milestone and implementation commits; several older messages are not Conventional Commits. They are already pushed and will not be rewritten. No raw CSV or `.env` is tracked (`git ls-files .env .env.example client/.env.example` listed only the two examples).

## References and project layout

The actual SRS Blueprint, 6-Day Roadmap, and Day 1–6 DeepDive documents are present in the user's project Planning/Day_Wise folders; their text was inspected without changing the source documents. The repository contains Day 1–3 implementation/completion notes, Days 1–4 acceptance evidence, Day 5 acceptance evidence, and requirements traceability. The root `README.md`, `server/README.md`, and `client/README.md` are the setup references. No prior Day 6 reports, demo script, or final checklist existed.

The repository has separate `server/` (Express, Mongoose, Node tests, MongoDB safety/import scripts) and `client/` (React/Vite, Vitest) packages; there is no root `package.json`. The backend mounts auth, user, admin analytics, cart/checkout, and product routes. The client proxies `/api` to a loopback backend in Vite development. Persistent startup uses `server/server.js` and `client/npm run dev` as separate processes.

## Environment and infrastructure

- Observed tools: Node `v24.14.0`, npm `11.9.0`, MongoDB binaries installed under MongoDB Server `8.3`, `mongosh`, Docker CLI, and Docker Compose v5.4.0.
- Docker Engine is not running: `docker info` could not open the Docker engine named pipe. `docker compose config` reports no configuration file. No Dockerfile or Compose file exists in this repository, so Docker-based startup and health checks are not available here.
- The root `.env` exists locally and is ignored; its contents were not read or printed. Root and client `.env.example` files are tracked placeholders. The required Mongo URI, JWT secret and local database assertions will be process-scoped for the disposable local tests.
- No relevant MongoDB/API/Vite ports were listening at baseline. The existing persistent Day 1–4 local database is on port 27020; it is not a target for Day 6 writes.
- The local raw CSV exists at ignored path `server/seed/data/flipkart_com-ecommerce_sample.csv`; it is not tracked and will not be copied or committed. Dataset declaration and third-party-rights uncertainty remain as recorded in `docs/dataset-provenance.md`.

## Available commands and tests

| Package | Scripts |
|---|---|
| Server | `start`, `import:products`, `audit:database`, `db:init:local`, `test:db:validation`, `test:checkout:rollback`, `test:checkout:concurrency`, `test:checkout:idempotency`, `recommendations:recompute`, `test:day5:integration`, `test` |
| Client | `dev`, `build`, `preview`, `test` |

The existing backend unit suite is `node --test` and includes auth, catalog, carts, transaction/check-out logic, safety gates, recommendation scoring/cache/fallback, and dashboard access/aggregation tests. The client suite uses Vitest. Three database integration scripts exercise 20-user last-unit concurrency, injected rollback failure, and idempotency/reconciliation. They require exact process-scoped database confirmation, a loopback-only replica set and test JWT configuration; each captures and deletes only its own fixture IDs.

The importer dry run was executed at baseline: 20,000 CSV rows, 19,159 valid rows, 841 rejected (78 invalid-price rows and 763 duplicate product rows), and 11,249 unmatched specification pairs. No database connection or writes occurred. It assigns stock `0` unless an explicit synthetic-stock policy is passed. The import uses bounded `bulkWrite` upserts and does not clear collections. `seed/seedProducts.js` uses deterministic `$setOnInsert` upserts. `scripts/initDb.js` delegates to the local-only gated schema initializer. The database-validation script temporarily writes invalid fixtures then deletes only their captured IDs.

## Architecture findings relevant to acceptance

- Product specs use `attributes: [{ key, value }]`; carts embed bounded items; orders reference products and retain historical names/prices/quantity snapshots. Reviews are a separate collection.
- Checkout performs a conditional `$gte` stock decrement inside a MongoDB transaction, then writes Order, CheckoutOperation, and clears the user's Cart in that transaction. Idempotency is unique by user/key.
- Recommendation generation lives in `server/jobs/computeRecommendations.js`; server startup registers `node-cron` at 02:00 `Asia/Kolkata` by default and does not run an immediate catalogue refresh. The response includes score evidence and a same-category fallback.
- Admin analytics uses one `$facet`; revenue/top-product branches count completed, shipped, and delivered orders while status counts include all statuses. Product category comes from the current Product, with missing products marked `Unattributed`.
- Declared indexes include product category/price, category/creation, created, price, name, and text indexes; unique user email, cart user and TTL, orders customer/date, checkout user/key, recommendations source, and review product/user lookup indexes. Detailed live plans remain unverified at this baseline.
- Seven strict collection validators are defined. A disposable DB validation run is required to verify the installed validators/indexes for this acceptance.
- SRS stretch items: cart TTL and transactional checkout are present in code; Change Streams, Atlas Vector Search, and GridFS are not found in implementation. Runtime/index verification remains pending.
- The SRS describes a Docker Compose architecture, Atlas Vector Search as an optional goal, and a 10,000+ dataset/<150 ms target. The actual repository has no Docker deployment files; semantic/vector recommendations are not implemented. These discrepancies will be reported, not disguised by adding features.

## Verification order and known constraints

1. Create a fresh task-owned loopback MongoDB replica set under a new temporary data directory and unique Day 6 database; verify it absent/empty before any write. Never use Atlas or port 27020.
2. Install the actual validators/indexes and import the local CSV using the guarded importer; recompute recommendation caches.
3. Start the API and Vite separately with process-scoped values, smoke-test API/login/customer checkout/dashboard, and confirm persistence/counts.
4. Run server/client regression suites and production build.
5. Run existing rollback, 20-request concurrency, and idempotency scripts on the disposable DB; check exact fixture cleanup.
6. Produce real before/after query plans without dropping an existing index: use a separate unindexed disposable benchmark collection/database, then add the actual index. Record actual counts and timing limits.
7. Complete traceability, demo/viva, security, README, and release reports. No release tag will be made unless the stated gates pass; GUI screenshots and oral rehearsal remain human tasks.

Docker Engine downtime and the lack of container definitions mean one-command Compose startup cannot be proven. The local CSV enables a realistic import, but redistribution remains AMBER; it stays out of Git. Atlas-only verification and manual GUI/oral tasks are not substitutes for local tests and will be labelled separately.

## Day 6 gate outcomes

| Gate | Status | Evidence / remaining limitation |
|---|---|---|
| 0 — baseline | PASS | Snapshot above; clean `main` at Day 5 commit, origin matched, no release tags. |
| 1 — clean local startup | PASS with Docker/UI limitations | Fresh isolated replica set, validators/indexes, 19,159-product import, full recommendations, API/Vite smoke, and controlled same-directory restart persistence after the initial restart failed and the local population was rebuilt; Docker Compose and visual screenshot checks unavailable. |
| 2 — regression | PASS | Server 85/85, client 60/60, client build succeeded (749.15 kB JS chunk advisory). |
| 3 — checkout | PASS | One 201/19 conflicts; rollback, idempotency, and reconciliation cases passed. |
| 4 — indexing | PARTIAL | Genuine 19,159-product explains and unique email-index metadata captured; execution samples were under 150 ms, but are insufficient to demonstrate the SRS latency target as an SLO. Category execution was 21 ms after vs 13 ms before, so no measured latency improvement is claimed. |
| 5 — requirements | PARTIAL at the original Day 6 audit | At that audit time review routes were absent. The later M3 follow-up implements and verifies review CRUD; see the current M3 PASS in the final checklist and traceability. |
| 6 — README/setup | PASS WITH LIMITATIONS | Native local setup and dataset caveats documented; Docker one-command start remains unavailable. |
| 7 — demo/viva | PASS | Timed script and viva answers include actual method and evidence; live GUI/oral rehearsal remain manual. |
| 8 — security/performance | PASS WITH OPEN ITEMS | Local safety, dataset scope, bundle advisory, and third-party rights recorded; overall dataset redistribution AMBER. |
| 9 — release | NOT READY FOR TAG | No `v1.0.0` tag created; Docker setup, Day 6 visual evidence, and rights scope are unresolved. |

The first attempt to restart `mongod` revealed that its initial process did not leave a usable replica-set config in the expected new-process state. The local single-member config was re-established on the task-owned directory and verified across a subsequent restart. The final reopened state contained 19,159 products, 19,159 recommendation records, 95,509 related items, and seven validators. The isolated explain benchmark DB did not persist across restart; its sanitized plans are preserved as evidence, and it contained no user data.
