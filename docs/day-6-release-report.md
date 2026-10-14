# Day 6 release report

Date: 2026-10-14.

## Candidate

- Starting commit: `0dcadc49bd2a5763503dd522fdf19a73417b50e2` (`feat: complete day 5 recommendations and analytics`). At Gate 0, `main` matched `origin/main` and the working tree was clean.
- Candidate contents: a narrowly scoped recommendation explanation-bound correctness fix and tests, plus Day 6 evidence, acceptance, setup, demo, viva, security, and release documentation.
- Tests/build: server 85/85; client 60/60; production build succeeds (749.15 kB minified JS warning).
- Database checkout checks: 20-way race 1 success/19 conflicts; rollback and idempotency/reconciliation pass on the isolated local replica set.
- Query-plan evidence: real 19,159-product category and text explain plans are recorded. The category index reduced documents examined but one observed latency did not improve; sustained SLO is unproven.
- Clean local startup and HTTP smoke passed; persistence after restarting the named local replica set confirmed 19,159 products, 19,159 recommendation records, 95,509 related entries, and seven validators.

## Release gate

**READY WITH LIMITATIONS for evaluation; release gate not fully satisfied.** Do not create `v1.0.0` in this run. The Docker one-command setup cannot be verified (Engine unavailable, no container definitions); no Day 6 visual screenshots were captured; and dataset/third-party rights remain AMBER. The application can be demonstrated with the verified native local setup, but the requested release conditions include an accurate clean startup path and complete release evidence. The baseline and acceptance docs explicitly record these limitations.

The dataset declaration is `DECLARED_CC_BY_SA_4_0`; the overall redistribution assessment is **AMBER — declared licence, scope/third-party rights not fully verified**. Raw CSV, downloaded image assets, database files, and secrets are excluded. This is not legal advice or a guarantee of non-infringement.

## Git and remaining action

The Day 6 code, tests, and evidence are being recorded in Conventional Commit form on local `main`; the final object ID and exact status are reported in the final Git summary. No push or release tag is made because the release gate is not all green. The local branch therefore will be ahead of `origin/main` after the Day 6 commit. Older commit messages are left untouched. `v1.0.0` did not exist locally or remotely at Gate 0 and is not created here.

Manual evaluation actions: run the short demo with a local admin/customer fixture, capture genuine GUI screenshots on the evaluation machine, and decide whether to distribute any dataset-derived catalogue material after resolving its rights scope. No production credentials or Atlas change are part of this task.
