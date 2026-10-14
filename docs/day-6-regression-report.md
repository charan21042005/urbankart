# Day 6 regression report

Date: 2026-10-14. Commands ran in the `server` and `client` packages. Because PowerShell's `npm.ps1` shim is disabled on this machine, package commands were invoked as `npm.cmd`.

| Check | Result | Evidence |
|---|---:|---|
| Server offline suite (`npm.cmd test`) | **85 passed, 0 failed** | Includes 14 recommendation tests; the Day 6 bounds regression is included. |
| Client Vitest (`npm.cmd exec vitest run -- --pool=threads --maxWorkers=1`) | **60 passed, 0 failed; 9 files** | Single worker; 72.99 s wall duration. |
| Client production build (`npm.cmd run build`) | **PASS**, 750 modules transformed | Output: 749.15 kB minified JavaScript (224.17 kB gzip), with Vite's >500 kB chunk advisory. |
| Database validators | **7 verified** | Installed on the isolated local replica-set database. |
| Import dry run | **20,000 rows; 19,159 valid; 841 rejected; 0 writes** | Counts include 78 invalid prices and 763 duplicate normalized products. |

The recommendation recompute initially failed with MongoDB validator error 121. A read-only diagnostic against the real imported catalogue localized the first offending output: recommendation explanation attribute keys/values exceeded the validator's 120-character bound. `similarityScorer` now bounds only the stored explanation fields and caps shared-tag explanations at 50; scoring and shared-feature counts still use all normalized features. Regression test: long keys/values and 55 shared tags keep score/count correct while respecting the existing cache validator. Focused recommendation tests passed 14/14, and the full recommendation cache subsequently completed with 19,159 documents and 95,509 related entries.

The root `npm` command failure was shell policy behavior, not a test failure; rerunning with `npm.cmd` completed the suites successfully. No production build failure or remaining test failure was observed. The bundle-size warning remains advisory and is documented for follow-up rather than addressed with an unrelated code-splitting refactor.
