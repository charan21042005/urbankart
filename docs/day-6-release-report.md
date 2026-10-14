# Day 6 release report

Date: 2026-10-14 (final academic-submission update).

## Candidate

- Starting commit: `0dcadc49bd2a5763503dd522fdf19a73417b50e2` (`feat: complete day 5 recommendations and analytics`). At Gate 0, `main` matched `origin/main` and the working tree was clean.
- Candidate contents: a narrowly scoped recommendation explanation-bound correctness fix and tests, plus Day 6 evidence, acceptance, setup, demo, viva, security, and release documentation.
- Tests/build: server 85/85; client 60/60; production build succeeds (749.15 kB minified JS warning).
- Database checkout checks: 20-way race 1 success/19 conflicts; rollback and idempotency/reconciliation pass on the isolated local replica set.
- Query-plan evidence: real 19,159-product category and text explain plans are recorded. The category index reduced documents examined but one observed latency did not improve; sustained SLO is unproven.
- Clean local startup and HTTP smoke passed. An initial restart failed because replica-set configuration was absent; the test database was rebuilt. A later controlled shutdown/restart of that rebuilt, populated task-owned directory confirmed 19,159 products, 19,159 recommendation records, 95,509 related entries, seven validators, and the unique user email index.
- At the original Day 6 audit, SRS review CRUD was absent and M3 was partial; the follow-up below resolves that finding. Recorded query executions were under 150 ms, but the SRS latency target remains partial because these are single-run database timings, not sustained end-to-end measurements.
- M3 review follow-up: review CRUD and aggregate maintenance passed 3 focused tests, all 88 server tests, an isolated local replica-set integration test, and the fresh isolated live HTTP smoke. Review routes are resolved. The broader SRS narrative's order-history/general order CRUD expectation remains partial because no general order management API exists; see the traceability scope table.
- Final academic-submission rerun before the data-recovery extension: server 88/88, client 60/60, 750 modules. Recovery/admin rerun: server 90/90, client 60/60 across 9 files, build 751 modules/761.34 kB minified JS with Vite >500 kB advisory. Fresh guarded MongoDB integrations then passed for Day 5 analytics/recommendations (full catalogue; 19,168 products including three temporary fixtures) and review CRUD/rating aggregates. After exact fixture cleanup, read-only counts were 19,165 products/recommendation docs, one preserved user, and zero carts/orders/reviews. `git diff --check` is rerun after these documentation edits.
- Final end-to-end recovery reused only the verified loopback replica set `ukAcceptance20261014` / database `urbankart_acceptance_20261014`; the root `.env` target was not used. The CSV dry run found 20,000 rows, 19,159 valid candidates and 841 rejected. First import inserted 19,159; repeat import inserted 0/matched 19,159. The active catalogue now totals 19,165 including six explicitly identified prior synthetic products; one pre-existing customer and all other existing records were preserved. API pages 1/800/1598, imported-product search/detail/category, fallback recommendation, overview/users/cart/orders/reviews/analytics admin reads, customer 403, and exact product CRUD fixture lifecycle were HTTP-checked. Seven validators and current category/text execution plans were inspected. The React admin UI has Overview, Users & carts, Orders, Products, Reviews and Analytics tabs. Live API checks covered all read sections, current-role denial and product CRUD/reference protection. Browser GUI/screenshot remains NOT VERIFIED; see the updated runbook/evidence file.

## Release gate

**Academic submission: READY WITH DISCLOSED SCOPE GAPS. Production-style release: NOT CLEARED.** Current suites, build, and the fresh isolated HTTP customer/admin journey pass. Broader SRS narrative items remain absent: general order-history/management APIs, seller-specific multi-vendor tenancy, and predictive trend analytics. Chrome previously exited with GPU process error `-1073741790`, so no fresh browser screenshot/visual verification is claimed. Docker Engine is unavailable and the repository has no container definitions. Performance remains partial and dataset/third-party rights remain AMBER. See the traceability matrix for formal FR/NFR versus narrative-scope distinctions and the [`final-e2e-demonstration-runbook.md`](final-e2e-demonstration-runbook.md) for college evaluation setup.

The dataset declaration is `DECLARED_CC_BY_SA_4_0`; the overall redistribution assessment is **AMBER — declared licence, scope/third-party rights not fully verified**. Raw CSV, downloaded image assets, database files, and secrets are excluded. This is not legal advice or a guarantee of non-infringement.

## Git and remaining action

The published academic handoff HEAD at the start of this audit was `bb0bc251ae1d09ccdadef75fcb6a9e48b30e1b0d` on `main`, aligned with `origin/main`. This audit made no commit, push, or tag. Current code/evidence/doc changes are uncommitted; inspect `git status` before any follow-up commit.

Manual academic demonstration: follow the native Windows steps in [README Quick Start](../README.md#-23-quick-start), then the timed [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md). Use local evaluation credentials and synthetic fixtures. If screenshots are requested, capture them on the evaluation machine. Do not include the ignored raw CSV or unverified retailer images in a redistributed bundle. No production credentials or Atlas change is part of this task.
