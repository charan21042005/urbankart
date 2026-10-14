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
- M3 follow-up completed: review CRUD and aggregate maintenance passed 3 focused tests, all 88 server tests, and an isolated local replica-set integration test. See the current M3 row in [`requirements-traceability.md`](requirements-traceability.md); the previous missing-route finding is resolved.
- Final academic-submission rerun: `server\npm.cmd test` passed 88/88 (0 failed); `client\npm.cmd test` passed 60/60 across 9 files; `client\npm.cmd run build` passed (750 modules, 749.15 kB minified JS, Vite >500 kB advisory). `git diff --check` passed before final documentation edits and is rerun before commit. Coverage includes authentication and current-role authorization, catalog and importer behavior, cart/checkout transactions and idempotency, recommendation scoring/cache/fallback, admin analytics authorization/aggregation, and review CRUD. Historical isolated MongoDB integration and HTTP evidence remains identified as such in the linked evidence; no new database integration run is claimed in this final rerun.

## Release gate

**Academic submission: READY. Production-style release: NOT CLEARED.** Current suites and build pass for the implemented scope, and the remaining environment and external-rights limits are documented. Chrome exited with GPU process error `-1073741790`, so no fresh browser screenshot/visual verification is claimed. Docker Engine is unavailable and the repository has no container definitions. Performance remains partial and dataset/third-party rights remain AMBER. These disclosures do not by themselves block the academic assignment submission; they do prevent an unconditional production or dataset-bundle clearance claim.

The dataset declaration is `DECLARED_CC_BY_SA_4_0`; the overall redistribution assessment is **AMBER — declared licence, scope/third-party rights not fully verified**. Raw CSV, downloaded image assets, database files, and secrets are excluded. This is not legal advice or a guarantee of non-infringement.

## Git and remaining action

The local Day 6 verification commit is `cda4274791bd76d3bfd658d64c8970528203439a`; the M3 follow-up commit is `d30b4c3fba14a738f65256cdd7fe18fcf0fad8c2`. The final evidence/documentation corrections are committed separately for academic handoff. No existing commit was amended or rewritten, and no release tag is created. Before this update, `main` was two commits ahead of the local `origin/main` reference; remote branch state must be checked before any normal push. A prior remote tag lookup could not reach GitHub, so remote tag presence was not independently confirmed. No remote tag is overwritten or recreated.

Manual academic demonstration: follow the native Windows steps in [README Quick Start](../README.md#-23-quick-start), then the timed [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md). Use local evaluation credentials and synthetic fixtures. If screenshots are requested, capture them on the evaluation machine. Do not include the ignored raw CSV or unverified retailer images in a redistributed bundle. No production credentials or Atlas change is part of this task.
