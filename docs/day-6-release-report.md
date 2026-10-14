# Day 6 release report

Date: 2026-10-14.

## Candidate

- Starting commit: `0dcadc49bd2a5763503dd522fdf19a73417b50e2` (`feat: complete day 5 recommendations and analytics`). At Gate 0, `main` matched `origin/main` and the working tree was clean.
- Candidate contents: a narrowly scoped recommendation explanation-bound correctness fix and tests, plus Day 6 evidence, acceptance, setup, demo, viva, security, and release documentation.
- Tests/build: server 85/85; client 60/60; production build succeeds (749.15 kB minified JS warning).
- Database checkout checks: 20-way race 1 success/19 conflicts; rollback and idempotency/reconciliation pass on the isolated local replica set.
- Query-plan evidence: real 19,159-product category and text explain plans are recorded. The category index reduced documents examined but one observed latency did not improve; sustained SLO is unproven.
- Clean local startup and HTTP smoke passed. An initial restart failed because replica-set configuration was absent; the test database was rebuilt. A later controlled shutdown/restart of that rebuilt, populated task-owned directory confirmed 19,159 products, 19,159 recommendation records, 95,509 related entries, seven validators, and the unique user email index.
- At the original Day 6 audit, SRS review CRUD was absent and M3 was partial; the follow-up below resolves that finding. Recorded query executions were under 150 ms, but the SRS latency target remains partial because these are single-run database timings, not sustained end-to-end measurements.
- M3 follow-up completed: review CRUD and aggregate maintenance passed 3 focused tests, all 88 server tests, and an isolated local replica-set integration test. See the current M3 row in [`requirements-traceability.md`](requirements-traceability.md); the previous missing-route finding is resolved.

## Release gate

**NOT FULLY ACCEPTED; NOT RELEASE READY.** Do not create `v1.0.0`. M3 is now complete, but the Docker one-command setup cannot be verified (Engine unavailable, no container definitions); no Day 6 visual screenshots were captured; performance is only partially evidenced; and dataset/third-party rights remain AMBER. The application remains demonstrable with the verified native local setup for supervised evaluation, with these gaps disclosed.

The dataset declaration is `DECLARED_CC_BY_SA_4_0`; the overall redistribution assessment is **AMBER — declared licence, scope/third-party rights not fully verified**. Raw CSV, downloaded image assets, database files, and secrets are excluded. This is not legal advice or a guarantee of non-infringement.

## Git and remaining action

The local Day 6 commit is `cda4274791bd76d3bfd658d64c8970528203439a` (`chore(day6): record verification and bound recommendation cache explanations`); it is one commit ahead of `origin/main`. This audit corrected documentation in the working tree after that commit. The existing commit was not amended or rewritten, and these corrections remain uncommitted. No push or release tag was made because the acceptance/release gate is not all green. `v1.0.0` did not exist locally at Gate 0 and was not created here.

Manual evaluation actions: run the short demo with a local admin/customer fixture, capture genuine GUI screenshots on the evaluation machine, and decide whether to distribute any dataset-derived catalogue material after resolving its rights scope. No production credentials or Atlas change are part of this task.
