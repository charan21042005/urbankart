# Day 6 clean-start verification

Date: 2026-10-14 (Asia/Kolkata)

## Result

**PASS for isolated native local startup and data persistence. PARTIAL for Docker-based startup and browser screenshots.** No Atlas endpoint was used. The exact local target was `urbankart_day6_verification` on a one-member `ukDay6Verification` replica set bound to `127.0.0.1:27221`; its task-owned data directory was `%TEMP%\urbankart_day6_verification_20261014`.

The fresh target was verified before initialization. `db:init:local` installed seven validators and 14 declared indexes. The guarded CSV import produced 19,159 products with stock set to synthetic zero; 20,000 rows were examined, 841 rejected, and no writes failed. The recommendation job produced 19,159 cache documents containing 95,509 related-product entries. A later restart verified that the same replica-set identity and data directory reopened with the same product/cache counts and seven validators.

## Application smoke results

The API started on `127.0.0.1:5000` and Vite on `127.0.0.1:5173`. HTTP checks returned: health 200; catalog through the Vite `/api` proxy 200; register 201; duplicate registration 409; login 200; cart add 201; checkout 201; order snapshot present with one item and stock reduced from one to zero; admin login/dashboard 200; customer request to the admin dashboard 403. The test used synthetic users and one synthetic product; cleanup by captured IDs was verified (zero test users and product remaining). No token, password, or secret was recorded.

The GUI was not inspected and no Day 6 screenshot was captured. This environment exposed no browser automation/screenshot tool. HTTP and Vite proxy checks are not represented as visual QA.

## Startup limitations

Docker CLI/Compose is installed, but the Docker Engine was unavailable and the repository has no Dockerfile or Compose file. Therefore the SRS-style one-command container startup remains **BLOCKED** here. The working local rehearsal requires MongoDB already running as a local replica set, followed by separate backend and Vite terminals; exact commands are in the root README.

## Evidence

- [`evidence/day-6/clean-start-http-smoke.json`](evidence/day-6/clean-start-http-smoke.json)
- [`evidence/day-6/product-import-summary.json`](evidence/day-6/product-import-summary.json)
- [`evidence/day-6/mongodb-index-explains.json`](evidence/day-6/mongodb-index-explains.json)
- [`day-6-baseline-audit.md`](day-6-baseline-audit.md)

The ignored raw CSV and MongoDB files remain outside Git. This report records the observed local test only; it does not establish dataset redistribution rights.
