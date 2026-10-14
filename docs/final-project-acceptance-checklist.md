# UrbanKart final project acceptance checklist

Date: 2026-10-14. This checklist reflects this Day 6 run, not prior milestone reports.

## Six SRS modules

| SRS module | Day 6 assessment |
|---|---|
| M1 — Product & Catalog Service | **PASS** for API/catalog/import behavior and real index evidence; rights to redistribute third-party-derived catalogue content remain separately AMBER. |
| M2 — Cart & Checkout Service | **PASS** for HTTP cart, transaction, race, rollback, idempotency, and order snapshot evidence. |
| M3 — Order & Review Service | **PARTIAL**: order snapshots/transactions pass; a Review model/collection exists, but no review service route was found in the current server routes. |
| M4 — Recommendation Engine | **PASS** for explainable content-based scoring, full-catalog recompute, bounded cache, fallback tests, and persisted local cache. Vector search is not implemented. |
| M5 — Analytics & Aggregation Layer | **PASS** for the admin `$facet` dashboard and live local role checks. |
| M6 — Web Application (React + Express API) | **PASS WITH VISUAL LIMITATION**: API and Vite proxy smoke/build/tests pass; no Day 6 GUI screenshot/visual review was available. |

## Core implementation and evidence

- [x] Six SRS modules traced in [`requirements-traceability.md`](requirements-traceability.md); current code and evidence checked.
- [x] Isolated local database initialized with seven validators and 14 declared indexes.
- [x] Local import: 19,159 product documents; source file remains ignored and untracked.
- [x] Recommendation cache: 19,159 source documents and 95,509 related entries; validator bounds regression fixed and tested.
- [x] API/Vite HTTP smoke: health/listing, registration/duplicate, login, cart, transactional checkout/order snapshot, admin dashboard and role denial.
- [x] Synthetic smoke records removed by captured IDs.
- [x] Restart persistence: same replica-set identity, 19,159 products, 19,159 caches, 95,509 related entries, seven validators.
- [x] Server tests 85/85; client tests 60/60; production client build succeeds.
- [x] Last-unit checkout race: 1 success, 19 conflicts; rollback and idempotency/reconciliation tests pass.
- [x] Real category/price and text-index execution plans saved under `docs/evidence/day-6/`.
- [x] Dataset declaration and third-party rights documented; storefront attribution present; overall redistribution clearance AMBER.

## Limits and release readiness

- [ ] Docker clean startup: BLOCKED (Docker Engine unavailable; no Dockerfile/Compose configuration).
- [ ] Browser GUI screenshots/visual smoke: not captured in this environment; HTTP checks are not visual acceptance.
- [ ] Sustained/cold-cache/concurrent performance SLO: not established by the single explain runs.
- [ ] Dataset, descriptions, trademarks, and linked image rights cleared for redistribution: not established; do not package raw CSV or retailer images.
- [ ] Change Streams, Atlas Vector Search, and GridFS stretch goals: not implemented.
- [ ] Annotated `v1.0.0` release tag: not created; release gates are not all met.

## Verdict

**READY WITH LIMITATIONS for supervised academic evaluation using the verified native local setup. NOT release-cleared for an unconditional public dataset bundle or one-command Docker demo.** See [`day-6-release-report.md`](day-6-release-report.md) for release gate status.
