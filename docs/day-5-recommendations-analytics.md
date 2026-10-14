# UrbanKart Day 5 — Recommendations and Admin Analytics

Review date: 2026-10-14. Scope: recommendation generation and display, admin-only analytics, and the requested implementation evidence. Days 1–4 details remain in the prior acceptance notes. Day 6 work is outside this closeout.

## Source documents and precedence

The named SRS Blueprint, 6-Day Roadmap, and Day 5 DeepDive DOCX files were read from the user-provided locations. Requirements below are mapped from those documents; their implementation steps and example commands are source guidance, not separate user authorization. The explicit task request and its safety constraints control the work.

Relevant document requirements:

- SRS FR-7: show up to five related products on a product page. SRS §10.3 calls for an explainable content-based approach; Appendix B.3 gives Jaccard over tags and a same-category bonus. SRS §9.3 describes a same-category/rating fallback.
- SRS FR-8: admin-only revenue/category/top-sales/order-status analytics. SRS §10.4 specifies in-database aggregation and Appendix B.4 sketches `$facet`; §11 requires backend authorization; §12 requests recommendation-explanation and hand-calculated analytics checks.
- Roadmap Day 5 and DeepDive §§4, 7, 8 ask for scheduled recommendation generation, a top-five product detail section, `/admin/dashboard`, charts, and acceptance checks.

The DOCX text asks for a nightly job and manual/safe verification. It does not authorize applying its sample `git add .` indiscriminately or beginning Day 6. Only reviewed Day 5 source files were staged for this closeout.

## Delivered behavior

### Recommendation generation

- Feature tokens are normalized (Unicode NFKC, case-folded, trimmed, and whitespace-collapsed) and deduplicated. Tags and typed attribute key/value pairs are separate feature kinds.
- Score is `|shared features| / |union features| + 0.2 when categories match`, capped at `1`; stored to six decimals. The cache holds up to five positive/relevant matches with shared tags, shared attributes, category match/bonus, and feature counts.
- Candidate ranking uses score descending and stable product ID ascending for ties. Recompute uses a bounded `bulkWrite`, removes deleted-source cache entries after a successful pass, and clears derived cache if a write fails partway through so incomplete output is not served as a coherent generation.
- The job runs daily at 02:00 in `Asia/Kolkata` unless `RECOMMENDATION_CRON_SCHEDULE` or `RECOMMENDATION_TIMEZONE` overrides it. A process-level singleton and `noOverlap` guard prevent duplicate/overlapping work. Startup registers the schedule but does not trigger a full catalogue recompute.
- `GET /api/products/:id/recommendations` validates product IDs and source existence. Fresh cached matches include explanations. Missing, stale, empty, or unusable cache data uses a same-category fallback sorted by rating, rating count, then ID; the response labels that fallback and does not describe it as a similarity result.

### Admin analytics

- `GET /api/admin/dashboard` requires a signed-in account whose current database role is `admin`. The route runs one MongoDB `$facet` aggregation.
- Revenue and top-product unit totals use `completed`, `shipped`, and `delivered` orders. Revenue multiplies immutable order item price and quantity. Category is read from the current Product because Order has no category snapshot; deleted/missing references use `Unattributed`. This means historical category totals can shift when a Product category changes.
- The top-five list groups historical product references and displays the latest available `nameAtPurchase` snapshot. Order status counts include every status, including pending and cancelled. UI labels currency as unspecified because the data model has no currency field.
- The React admin page uses API values for revenue, top-unit, and status charts, and includes loading, error/retry, empty, and restricted states. The storefront recommendation panel labels engine results and category-only fallback separately.

## Acceptance evidence — 2026-10-14

| Requirement | Evidence | Result |
|---|---|---|
| Similarity scoring and explanation | `server/test/recommendations.test.js`: normalization, deduplicated typed features, category bonus, zero overlap, deterministic order, top-five bound | PASS |
| Cache refresh safety | Unit tests for upsert, stale-source removal, no writes after catalogue read failure, and cache invalidation after a failed bulk refresh | PASS |
| Public recommendation route | Offline route tests for invalid/missing IDs, fresh cache, explanation, stale-cache fallback, and database failure; isolated MongoDB HTTP check for cache then category fallback | PASS |
| Admin route protection and one aggregation | Offline tests reject missing/invalid/expired/customer identities before aggregation and assert one `$facet`; isolated HTTP check permits admin and denies customer | PASS |
| Aggregation calculations | Isolated DB fixture compared against hand-calculated values: Electronics 32, Kitchen 15 after a category edit, Unattributed 32; statuses include pending/cancelled; deleted product remains in sales totals | PASS |
| Frontend states and visualizations | Client component/API tests cover engine explanation, fallback, empty/error/retry, customer restriction, chart panels; production build succeeds | PASS |
| Dataset declaration and third-party rights | See [`dataset-provenance.md`](dataset-provenance.md): dataset declaration `DECLARED_CC_BY_SA_4_0`; overall redistribution clearance remains `AMBER` | Separate review; no image download or raw CSV committed |

### Commands and isolated database

- `server`: `npm test` — 81 passed, 0 failed.
- `client`: `npm exec vitest run -- --pool=threads --maxWorkers=1 --reporter=dot` — 60 passed, 0 failed across 9 files. The single-worker setting avoids the default worker configuration hanging in this environment.
- `client`: `npm run build` — passed (750 modules transformed). Vite reports a 749 kB minified JavaScript chunk; code splitting is a possible later performance task.
- A fresh database `urbankart_day5_acceptance_20261014` was created on a loopback-only MongoDB 8.3.7 replica set `ukDay5Acceptance`, port 27021, under a task-specific temporary data directory. Before initialization, `listDatabases` showed only `admin`, `config`, and `local`. The existing persistent development database on port 27020 was not used.
- The existing local database preflight confirmed the target name, loopback URI, single advertised loopback member, replica-set identity, and writable primary. `db:init:local` installed and verified seven validators and fourteen declared indexes. `test:day5:integration` then created three products and six synthetic orders, exercised the real HTTP routes, checked hand-calculated analytics and recommendation cache/fallback, and removed its fixtures by their exact captured IDs. It did not drop the database.
- MongoDB process URI, database confirmations, test JWT secret, and topology assertions were process-scoped; no `.env` or Atlas connection was used. The disposable database retains only initialized empty schema/indexes after fixture cleanup. Its local `mongod` process was shut down after verification; the task-specific data directory remains under `%TEMP%` for reproducibility.

## Known limits

- Similarity quality depends on real, well-formed tags and attributes. Missing features reduce matches; category-only ties are deterministic and are not presented as strong semantic similarity.
- Full-catalogue recomputation is a batch operation. The code bounds write batches but does not yet benchmark catalogue scale; that is outside Day 5 acceptance.
- Product category history is not available in existing order snapshots, so category analytics are current-category attribution rather than a historical category ledger.
- This implementation and its dataset note are engineering documentation, not legal advice or a guarantee of non-infringement. Image, trademarks, product-description, and dataset uploader authority questions remain separate as recorded in the dataset provenance assessment.
