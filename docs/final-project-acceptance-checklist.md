# UrbanKart final project acceptance checklist

Date: 2026-10-14. This checklist includes the final academic-submission regression rerun and preserves earlier Day 6 evidence and limitations.

## Six SRS modules

| SRS module | Day 6 assessment |
|---|---|
| M1 — Product & Catalog Service | **PASS** for API/catalog/import behavior and real index evidence; rights to redistribute third-party-derived catalogue content remain separately AMBER. |
| M2 — Cart & Checkout Service | **PASS** for HTTP cart, transaction, race, rollback, idempotency, and order snapshot evidence. |
| M3 — Order & Review Service | **PASS for order snapshot/transaction FRs and review CRUD; PARTIAL broader scope**: review lifecycle is verified, but the SRS narrative's general order history/list and update/delete operations are absent. |
| M4 — Recommendation Engine | **PASS** for explainable content-based scoring, full-catalog recompute, bounded cache, fallback tests, and persisted local cache. Vector search is not implemented. |
| M5 — Analytics & Aggregation Layer | **PASS for FR-8** admin `$facet` dashboard and role checks; SRS narrative trend-prediction endpoint is not implemented. |
| M6 — Web Application (React + Express API) | **PARTIAL**: API/Vite startup and automated checks pass; browser visual verification could not complete because installed Chrome exited with GPU process error `-1073741790`. |

## Core implementation and evidence

- [x] Six SRS modules traced in [`requirements-traceability.md`](requirements-traceability.md); current code and evidence checked.
- [x] Isolated local database initialized with seven validators and 14 declared indexes.
- [x] Local import: 19,159 product documents; source file remains ignored and untracked.
- [x] Recommendation cache: 19,159 source documents and 95,509 related entries; validator bounds regression fixed and tested.
- [x] API/Vite HTTP smoke: health/listing, registration/duplicate, login, cart, transactional checkout/order snapshot, admin dashboard and role denial.
- [x] Review CRUD: focused tests and isolated MongoDB replica-set integration; public product/single-review reads, authenticated create, author-only patch/delete, validation, and aggregate recomputation.
- [x] Fresh isolated live HTTP smoke: registration/duplicate handling, current-role admin/customer authorization, product CRUD/search/detail, explainable recommendation cache, cart add/update/remove, checkout/order snapshot/reconciliation, analytics values, review ownership and aggregate lifecycle. Synthetic records were removed by captured IDs.
- [x] Customer/admin HTTP smoke records removed by captured IDs; the separate current demo DB now retains only six original synthetic products and six recommendation cache records, with zero users/orders/reviews.
- [x] Controlled restart persistence of the rebuilt task-owned database: same replica-set identity, 19,159 products, 19,159 caches, 95,509 related entries, seven validators. The first restart attempt failed and the population was rebuilt before this controlled check.
- [x] Final native startup smoke on a separate loopback-only disposable database: seven validators and 14 indexes initialized; Express health and Vite root returned HTTP 200. Synthetic fixtures were isolated to that database and its `mongod` was cleanly stopped.
- [x] Current server suite 88/88 (M3 follow-up); original Day 6 baseline was 85/85. Client tests 60/60; production client build succeeds.
- [x] Last-unit checkout race: 1 success, 19 conflicts; rollback and idempotency/reconciliation tests pass.
- [x] Real category/price and text-index execution plans saved under `docs/evidence/day-6/`.
- [x] Dataset declaration and third-party rights documented; storefront attribution present; overall redistribution clearance AMBER.

## Cross-cutting gates

| Gate | Status | Evidence / limit |
|---|---|---|
| Schema validation | **PASS** | Seven local validators initialized; review text validator matches the Mongoose field/limit. |
| MongoDB index selection | **PASS** | Category/price IXSCAN and weighted text index TEXT_MATCH are in raw explain evidence. |
| Checkout concurrency | **PASS** | Isolated race produced one 201 and nineteen 409; stock remained nonnegative. |
| Transaction rollback | **PASS** | Injected order failure restored stock/cart and created no order. |
| Recommendation fallback | **PASS** | Automated route/model tests cover stale/missing-cache same-category fallback. |
| Admin authorization | **PASS** | Current-role route tests and recorded HTTP smoke: admin 200, customer 403. |
| Clean-start reproducibility | **PASS WITH LIMITATIONS** | Controlled database restart passed; final native API/Vite health smoke returned 200. Docker remains unavailable. |
| SRS performance target | **PARTIAL** | Local single-run database explains are under 150 ms, but are not a sustained/end-to-end SLO. |
| Documentation | **PASS WITH LIMITATIONS** | README, traceability, API, demo, viva, security and release docs reviewed; manual walkthrough still required. |
| Dataset redistribution | **AMBER** | Declared CC BY-SA 4.0; uploader scope and third-party content rights remain unverified. |
| Demo readiness | **PARTIAL** | Native services start; Chrome GUI/screenshot attempt failed with GPU process exit `-1073741790`. |
| Broader SRS narrative scope | **PARTIAL** | General order history/management, seller-specific multi-vendor behavior, and trend-prediction analytics are not implemented; FR-1–FR-10 statuses are listed separately in traceability. |
| Roadmap React review-CRUD checkbox | **GAP** | Review CRUD is API-only; the SRS does not require a review form, but the Roadmap's final UI checklist does. |

## Limits and release readiness

- [ ] Docker clean startup: BLOCKED (Docker Engine unavailable; no Dockerfile/Compose configuration).
- [ ] Browser GUI screenshots/visual smoke: Chrome launch failed with GPU process exit `-1073741790`; HTTP checks are not visual acceptance.
- [ ] SRS <150 ms performance goal: **PARTIAL**; three single-run database explain samples were under 150 ms, but no sustained or end-to-end SLO is established.
- [ ] Dataset, descriptions, trademarks, and linked image rights cleared for redistribution: not established; do not package raw CSV or retailer images.
- [ ] Change Streams, Atlas Vector Search, and GridFS stretch goals: not implemented.
- [ ] Annotated `v1.0.0` release tag: intentionally not created; this academic submission does not claim production certification.

## Academic submission decision

**READY FOR ACADEMIC SUBMISSION WITH DISCLOSED SCOPE GAPS.** The latest rerun passed all 88 server tests, all 60 client tests, and the client production build, and the fresh isolated live HTTP journey passed. Broader SRS narrative gaps and environment limits remain explicit; this is an academic handoff, not production readiness.

| Area | Submission status | Evidence / qualification |
|---|---|---|
| Implemented and tested | **PASS** | Catalog, authentication/authorization, cart, transactional checkout, recommendations/fallback, admin analytics, and review CRUD are covered by the current server/client suites and recorded isolated integration checks. |
| Performance | **PARTIAL** | Index plans and three single-run database timings are recorded; <150 ms sustained/end-to-end performance is not established. |
| Environment-dependent verification | **NOT VERIFIED** | Docker clean startup is unavailable; fresh Day 6 browser visual/screenshot verification did not complete. Native HTTP startup checks did pass. |
| External rights | **AMBER** | Kaggle declares CC BY-SA 4.0; uploader authority and separate rights in retailer content remain unverified. No legal clearance is claimed. |
| Broader narrative scope | **PARTIAL** | No seller-specific tenancy, general order history/management API, or trend-prediction endpoint. See traceability matrix. |

For evaluation, use the native Windows setup and demo steps in [README Quick Start](../README.md#-23-quick-start) and [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md). Capture genuine screenshots on the evaluation machine if requested. Do not distribute the raw CSV or unclear third-party assets as part of the submission bundle.

## Verdict

The original Day 6 **production-style release gate remains NOT FULLY PASSED**: performance evidence is partial, visual/Docker checks remain open, and redistribution remains AMBER. Separately, the project is **READY FOR ACADEMIC SUBMISSION** based on passing implementation/regression checks and explicit disclosure of those limitations. See [`day-6-release-report.md`](day-6-release-report.md) for the distinction.
