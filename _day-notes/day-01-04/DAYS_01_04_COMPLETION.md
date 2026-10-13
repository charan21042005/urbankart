# UrbanKart Days 1–4 Completion and Evidence

**Verification date:** 2026-10-13
**Starting commit:** `570aef6789f1f80650cd4618d5dabd3d6a8e14db` on `main`, initially equal to `origin/main`
**Scope:** SRS, roadmap, and Day 1–4 guides. Day 5 work is intentionally excluded.

This report supersedes older “not integrated yet” or “checkout unavailable” notes for the specific behaviors newly verified below. Earlier stage reports remain a historical record. The reported Git baseline was clean; this task has not committed or pushed its current changes.

## Requirement-to-evidence matrix

| Day | Requirement | Status | Evidence and boundary |
| --- | --- | --- | --- |
| 1 | Identify the six SRS collections | PASS | `products`, `users`, `carts`, `orders`, `reviews`, `recommendations`; `checkoutoperations` is a seventh operational collection for idempotency. |
| 1 | Align Mongoose schemas and database validators | PASS locally | Seven strict `$jsonSchema` validators initialized on the disposable replica set; `autoCreate`/`autoIndex` remain disabled on normal startup. Atlas was not touched or verified. |
| 1 | Demonstrate invalid-document rejection | PASS locally | MongoDB rejected one invalid synthetic document in each of the seven collections with validator error 121. |
| 1 | Explain embedding, references, and Attribute Pattern | PASS | Product attributes use `{ key, value }`; cart/order line items are embedded; user/product links are references; orders retain purchase snapshots. See API/server README. |
| 1 | Safe, reproducible local initialization and sample seeding | PASS | Initializer and legacy sample seed require explicit database confirmation, URI path match, loopback-only URI, replica-set attestation, and a writable-primary `hello` whose advertised members are all loopback. The sample seed now uses deterministic insert-only upserts; it never clears products. |
| 2 | Import 10,000+ genuine dataset rows | PASS for isolated run | 20,000 CSV records inspected; 19,159 unique valid products were written and counted in the disposable local database. The DB was task-owned and is removed after verification. |
| 2 | Reproducible, bounded and guarded CSV import | PASS | Dry-run default, 500-row batches, deterministic source IDs, validation and duplicate accounting, explicit local DB confirmation, explicit synthetic stock default. |
| 2 | Product list/detail/search/category/pagination/sort | PASS | Unit/API contract tests and live HTTP through Vite proxy returned real database products, search results, categories, and details. |
| 2 | Product create/update/delete with admin protection | PASS | Mock/API regression tests and live local API CRUD as a synthetic current admin; create, patch, and delete succeeded. |
| 2 | Registration, login, password handling and JWT | PASS for tested flows | Offline tests cover bcrypt/JWT behavior. Live registration/login ran against local MongoDB; attempted registration with `role: admin` returned a customer, and responses did not include a password hash. |
| 2 | Registration, profile, customer administration and account closure | PASS for exercised flows | Offline tests cover admin-only customer create/list/read/update/soft-delete with safe field whitelists, bcrypt hashing, and current-role checks. A separate live local check verified customer self-closure and retained order references. Admin role provisioning remains out of band. |
| 2 | Dataset license, currency and inventory provenance | PARTIAL | The original Kaggle page is accessible but does not expose a verifiable license. CSV/API has no explicit currency or real stock. Import used stock `0` by explicit policy; no currency was invented. |
| 3 | Authenticated cart add/update/remove and ownership | PASS for exercised flow | Live local API add, quantity update, removal, re-add, and cart read; offline route tests cover auth and stock validation. |
| 3 | Transactional checkout and immutable snapshots | PASS for tested scenarios | Local replica-set scripts verified transaction rollback, idempotency, reconciliation, and last-unit concurrency; persisted order snapshot/total/cart/stock were read directly. |
| 3 | Same-key replay, conflict, duplicate concurrency, ownership | PASS for tested scenarios | Replay returned same order; conflicting cart intent returned 409 unchanged; concurrent same-key requests created one order; other-user lookup returned 404; dropped response reconciled to the committed order. |
| 3 | Twenty requests competing for last unit | PASS | One HTTP 201, nineteen HTTP 409; final stock 0; one order; winning cart empty; nineteen losing carts retained. |
| 3 | Rollback after injected order-write failure | PASS | Stock 5 before and after; zero failed orders; cart item retained; stock update reached; session ended. |
| 3 | Every production retry/unknown-commit and cart-edit race | PARTIAL | The injected scenarios passed, but they do not cover every driver-level unknown commit or production workload. A changed cart is fingerprint-checked and returns conflict; arbitrary concurrent cart editing was not separately stress-tested. |
| 4 | Real API-backed catalog, search, category, detail, cart, checkout UI | PARTIAL | Current React routes and API clients are implemented; client tests pass. This follow-up verified real HTTP requests through Vite to Express and the local replica-set database using synthetic records. No browser interaction/screenshots could be captured. |
| 4 | Full browser purchase journey at mobile/tablet/desktop | BLOCKED | Fresh Brave headless runs with a separate profile and normal multiprocess settings exited with GPU subprocess access-denied errors and fatal GPU-process failure; a targeted software-rendering attempt also failed. Prior Edge and Chrome attempts failed similarly. No browser automation tool/package is installed, no screenshots were captured, and no visual-pass claim is made. |
| 4 | Reviews, recommendation UI/generation, analytics | OUT OF SCOPE | Recommendations and analytics are later roadmap work; no review API/screen is claimed. |

## Source documents and scope reconciliation

Requirements were compared against the supplied `UrbanKart_SRS_Blueprint.docx`, `UrbanKart_6Day_Roadmap.docx`, and Day 1, Day 2, Day 3, and Day 4 deep-dive documents. The SRS names six core collections; `checkoutoperations` was added only for the checkout idempotency/reconciliation contract. The existing `{ key, value }` attribute names are canonical to avoid a breaking migration from the SRS example `{k,v}`. Recommendations stay schema-only because their generation is planned for Day 5. The roadmap's 10,000+ catalog target takes precedence over the smaller Day 4 target.

The Day 2 guide calls for user CRUD. Admin-only customer CRUD is available at `/api/users` and `/api/users/:id`; it cannot assign roles, return password hashes, or physically delete customer records. Deletion anonymizes/deactivates customers while preserving their IDs for existing orders. Customer self-closure remains at `DELETE /api/users/me`; administrator self-closure is rejected and administrator provisioning remains out of band. Mocked/offline route tests cover these routes. A prior isolated local HTTP-through-Vite check also exercised customer create/read/update/soft-delete; that is separate from this recheck's checkout tests.

At the original completion pass, the supplied Word files were locked. During this acceptance recheck, the six-day roadmap and Day 1–3 guides could be opened and read from their DOCX packages. The SRS and Day 4 guide remained locked by another process, so their wording could not be independently rechecked in this pass. The mapping above retains earlier recorded findings for those two documents and does not claim a fresh complete review of every source requirement.

## Dataset inspection and import

- Source: PromptCloudHQ, [Flipkart Products on Kaggle](https://www.kaggle.com/datasets/PromptCloudHQ/flipkart-products). The dataset page was accessible, but the page content did not expose a license; license and redistribution permission remain **unverified**.
- Do not treat a third-party mirror or metadata index as proof of the original author's grant. A possible licensed replacement is [Open Food Facts](https://openfoodfacts.github.io/openfoodfacts-server/api/): its official API documentation identifies the database as ODbL and individual contents under the Database Contents License. It is food-only, requires attribution/share-alike compliance for the database, and is not a drop-in substitute for the broader Flipkart catalog; review its reuse terms and data suitability before adopting it.
- Local raw file: `server/seed/data/flipkart_com-ecommerce_sample.csv`, 38,114,963 bytes; this path is ignored by Git and must remain uncommitted.
- Actual headers: `uniq_id`, `crawl_timestamp`, `product_url`, `product_name`, `product_category_tree`, `pid`, `retail_price`, `discounted_price`, `image`, `is_FK_Advantage_product`, `description`, `product_rating`, `overall_rating`, `brand`, `product_specifications`.
- Dry-run totals: 20,000 rows; 19,159 valid unique normalized rows; 841 rejected; 78 invalid prices; 763 duplicate normalized products; 2 repeated `pid` values; 0 repeated `uniq_id`; 5,861 rows missing brand; 11,249 specification pairs lacked a usable key/value mapping.
- Imported database check: 19,159 products with unique deterministic `_id` values, 262 distinct categories, 19,159 non-empty `attributes` arrays, 2 missing descriptions, and zero non-numeric/negative prices or negative stock. All imported stock values were the explicitly chosen synthetic default 0. The count describes the temporary verification database at the time of import, not a retained Atlas/local catalog after teardown.
- A separate persistent local development catalog was subsequently created in `%LOCALAPPDATA%\UrbanKart\mongodb-day1-4-dev`, database `urbankart_local_dev`, replica set `ukLocalDev`, bound only to `127.0.0.1:27020`. Its read-only post-import count is 19,159 products. Stock remains the explicit synthetic default `0`; the catalog is browseable, but checkout cannot succeed against those products. The dataset remains local because its redistribution license is unverified.
- No currency field was present. Prices are numeric `discounted_price` values; no currency label or exchange-rate conversion is asserted. Source images are not converted into storefront image URLs.

## Database and checkout evidence

Earlier database-backed writes used a fresh local MongoDB Server 8.3.7 on `127.0.0.1:27019`, replica set `ukDays14`. This follow-up created a separate disposable database `urbankart_days1_4_verify_20261013_final` in a task-owned temporary directory. Before writes, `hello` confirmed a writable primary and its only advertised member was loopback. No Atlas, production, or existing `test` database was contacted. Root `.env` was not edited; task-specific URI/JWT were process-scoped.

Commands executed from `server/`:

```powershell
npm.cmd run db:init:local -- --confirm-local-db urbankart_days1_4_verify_20261013_final
npm.cmd run test:db:validation -- --confirm-local-db urbankart_days1_4_verify_20261013_final
npm.cmd run import:products -- --import --stock-default 0 --confirm-local-db urbankart_days1_4_verify_20261013_final
npm.cmd run test:checkout:idempotency -- --confirm-test-db urbankart_days1_4_verify_20261013_final
npm.cmd run test:checkout:rollback -- --confirm-test-db urbankart_days1_4_verify_20261013_final
npm.cmd run test:checkout:concurrency -- --confirm-test-db urbankart_days1_4_verify_20261013_final
```

The idempotency run verified: first checkout 201 and same-key replay 200 with the same order; the key used independently by another user; cross-user lookup 404; changed-cart reuse 409 with stock and cart unchanged; insufficient-stock 409 with zero orders; two simultaneous same-key requests converged on one order (201/200); a deliberately dropped HTTP response reconciled to 200; and injected failure after operation write returned 503 with no persisted order/operation, original stock, and cart preserved.

The 20-request last-unit and rollback results are recorded in the matrix above. A separate live local Express-through-Vite API sequence verified search, category, detail, registration, login, profile read/update, customer-role enforcement, admin product create/update/delete, cart operations, checkout, and reconciliation. Direct MongoDB reads verified one persisted order and operation; stock changed 5 to 4, the order stored a synthetic product name/price/quantity snapshot and total 3.25, and the user cart was empty. The API sequence is an HTTP integration test, not a browser interaction.

The disposable verification database held 19,159 products after checkout tests; `users`, `carts`, `orders`, and `checkoutoperations` were all empty after captured-fixture cleanup. Seven validators remained verified. The task-owned MongoDB process and data directory were stopped and removed; no product import persists in Git or a user database.

Customer account closure was then verified on a separate task-owned local replica set, `ukClosure`, using database `urbankart_day14_closure_verify`. A synthetic customer and related order were created; `DELETE /api/users/me` returned 200, the persisted account became inactive with an anonymized email and a bcrypt-formatted random replacement hash, the old token and login both returned 401, and the order still referenced the same customer ID. The user and order were removed by their captured IDs, then that temporary server/data directory was stopped and removed.

This final follow-up first used a separate disposable MongoDB 8.3 replica set `ukDay14QA` on `127.0.0.1:27019` and database `urbankart_day14_http_verify`. Before application-data writes, the process ID was checked against the sole listener, `hello` confirmed a writable primary, and its only member was `127.0.0.1:27019`. Port 27018 had a pre-existing local `mongod` process. A read-only local `ping` had occurred while checking the port; after detecting the second listener, no schema, fixture, import, or application writes were made to 27018 and that process was left untouched. Express listened on `127.0.0.1:5020`; Vite listened on `127.0.0.1:5192` and proxied `/api` to that Express process. Process-scoped variables selected the loopback URI and database; root `.env` was not changed or used as a target.

The live HTTP-through-Vite check used one synthetic product, a synthetic administrator, and synthetic customer accounts. Home HTML, health, product search/category/detail, registration/login, admin customer create/read/update/soft-delete, cart add/update/remove, checkout, same-key replay, and user-scoped reconciliation succeeded. Checkout returned `201`, persisted one order and one idempotency operation with the API-calculated total `25`, and cart clearing was observed. A separate checkout against a deliberately zeroed synthetic product returned `409` and retained the cart. Another user's reconciliation request returned `404`. This was an HTTP/MongoDB integration check, not browser QA; all task-owned Express/Vite/MongoDB processes and the disposable data directory were stopped and removed afterward. No synthetic test data remains.

The persistent development database is separate from that disposable HTTP fixture database. Its exact loopback listener and `hello` identity were rechecked before writes. The explicitly gated initializer installed seven validators and fourteen declared indexes; the validator rejection command returned code 121 for all seven collections; the CSV importer wrote 19,159 products with explicit stock default `0`. A read-only `hello`/collection/count query confirmed the database name, replica-set name, sole loopback host, and product count. The persistent `mongod` remains running for local development; no database files were placed in the repository or OneDrive.

## Frontend and browser QA

The implementation uses React Router routes `/`, `/products/:id`, `/cart`, `/checkout`, `/login`, `/register`, and a not-found route. Search/sort/filter/pagination are backend-backed. Auth stores its JWT in memory; the shared request interceptor attaches it. Cart mutations refresh server state and the checkout view requires server confirmation or user-scoped reconciliation before displaying success.

Earlier verification confirmed Express and Vite proxy HTTP integration on loopback; it was not a browser interaction. In this acceptance follow-up, Brave was tested with a fresh profile and standard multiprocess configuration; it failed before rendering with repeated GPU subprocess exits (`-1073741790`) and fatal GPU unavailability. One retry with GPU disabled failed the same way. Prior Edge and Chrome attempts reported equivalent failures. No fresh screenshots, browser interaction, viewport review, or browser-console/network results are available. Historical Stage G/H screenshots describe earlier baselines and are not evidence for this diff.

## Offline checks

Final offline checks after the source and README/report edits, including this customer-management follow-up:

- `npm.cmd test` in `server/`: **65 passed, 0 failed** (includes admin-only customer CRUD and account-closure tests).
- `npm.cmd test` in `client/`: **44 passed, 0 failed**.
- `npm.cmd run build` in `client/`: passed (173 modules transformed). `npm.cmd ls --depth=0` and `npm.cmd ls --package-lock-only --depth=0` in both packages: passed. `node --check` across 44 server/client JavaScript files: passed.
- `npm.cmd run import:products -- --dry-run`: 20,000 rows, 19,159 valid, 841 rejected, 78 invalid prices, 763 duplicate normalized products, 2 repeated product IDs, and 11,249 unmatched specification pairs; this command made no writes or connection.
- On the confirmed persistent loopback replica set, `db:init:local` initialized the seven collection validators/index declarations, `test:db:validation` recorded validator error 121 for all seven invalid fixtures, and import mode wrote 19,159 products with the explicit stock default 0. A separate read-only query verified 19,159 product documents afterward.
- `git diff --check`: passed after the final code/documentation edits.
- `.env` SHA-256 matched the recorded pre-task baseline; `.env` and the raw CSV are ignored and not tracked. Changed-file leak scans found only documented placeholders and synthetic test URI values; no real credentials, full URI, JWT, or password value was found.

Offline client/server tests are distinct from the local MongoDB and HTTP integration scenarios. During this final follow-up, MongoDB was contacted only at the verified loopback test and development replica sets described above; no Atlas, production, or existing `test` database was contacted. The supplied DOCX reference files were locked by Word and not edited; no DOCX parity claim is made for this Markdown completion report.

## Security, cleanup, and remaining work

- `.env` and `server/seed/data/` are ignored. The CSV, database directory, generated browser profile, and logs are not deliverables. No credentials, full URIs, tokens, or password values belong in reports or commits.
- The pre-existing 18 products in the Atlas `test` database were not touched; Atlas/production were not contacted. There is no claim about Atlas collection validators or catalog counts. The persistent local catalog is private local development data and is excluded from Git.
- Dataset license/redistribution permission is unverified and must be resolved before publishing the CSV or redistributing its data.
- Product admin deletion and admin-only customer CRUD are implemented. Customer admin deletion/self-closure anonymizes and deactivates the account while preserving its user ID for historical orders; admin self-closure and public role changes are prohibited. Admin customer-management routes have offline tests; they were not live-tested during this follow-up.
- No payment, tax, address, shipping, or currency functionality exists. Reviews endpoints/UI, recommendation generation, analytics, Day 5, and performance benchmarks are not claimed.
- Browser UI screenshots and the full user-driven purchase walkthrough remain outstanding because Chrome, Edge, and Brave fail to launch reliably under this Windows environment's GPU/process access restrictions. Use a machine or browser environment that can run a standard multi-process browser, then capture fresh screenshots at 390x844, 768x1024, and 1440x1000 and inspect purchase and error paths.
- Dataset license/redistribution remains unverified. Resolve it from the dataset owner authoritative terms or replace the dataset with an appropriately licensed source before redistribution.

- No Days 1–4 completion claim is made: fresh browser QA remains blocked and dataset licensing is unresolved. The separate LocalAppData development database remains loopback-only and is not a release artifact. Any commit must preserve these limitations in the release notes.

## Request and checkout, in plain language

The React page asks the shared Axios client for a product list. Vite forwards `/api` requests to loopback Express. Express validates the query/body and authorization, Mongoose maps the request to a collection, and MongoDB returns BSON documents that Express sends as JSON. For checkout, the server reads the user's cart and current prices, then one transaction conditionally reserves stock, stores an order snapshot and idempotency mapping, and clears the cart. MongoDB commits those related writes together or rolls them back together. A unique user/key index prevents the same logical checkout from creating two orders; a lost response is checked with the same key before the UI can claim success.

## Final acceptance recheck (2026-10-13)

- The local development target was read-only verified as `urbankart_local_dev` on MongoDB 8.3.7 replica set `ukLocalDev`, with the sole advertised member `127.0.0.1:27020`. It contained 19,159 products, seven validators, Cart's unique `userId` index, and zero users, carts, orders, or checkout operations. Express had active local MongoDB sockets; Vite and `/api/health` responded on loopback. HTTP requests through Vite returned the real 19,159-product count, 262 categories, and matching category/search/detail results. These HTTP checks are not browser interaction.
- A separate test database, `urbankart_days1_4_acceptance_20261013`, was confirmed absent before initialization on that loopback replica set. Seven validators and 14 declared model indexes were installed. The validation test rejected one invalid document in each collection. Real MongoDB transaction tests passed for same-key replay, conflicting key reuse, duplicate concurrent requests, cross-user reconciliation denial, lost-response reconciliation, insufficient stock, injected rollback, and 20 requests for the last unit (one 201, nineteen 409; final stock 0; one order). Fixture cleanup completed; a post-test read found zero documents in all seven collections. Its validators and indexes were retained; no database-wide drop was run.
- Fresh offline checks passed: server tests 65/65, client tests 44/44, client production build (173 modules), dependency/lockfile listings for both packages, syntax checks for 44 JavaScript files, `git diff --check`, and the importer dry run (20,000 rows; 19,159 valid; 841 rejected; 78 invalid prices; 763 duplicate normalized products; no database connection).
- A fresh normal visible Chrome launch with a separate temporary profile exited before rendering. Its stderr recorded GPU process exit `-1073741790` and `GPU process isn't usable`; no screenshot was captured. Browser journey, viewport, keyboard, console, and visual acceptance remain **BLOCKED**. No other browser retry was made.
- The [PromptCloudHQ Kaggle dataset page](https://www.kaggle.com/datasets/PromptCloudHQ/flipkart-products) remains accessible, but its current page content does not expose a verifiable dataset license. Redistribution permission remains **unverified**; the raw CSV remains ignored and uncommitted.
- The root `.env` was not edited, and no Atlas, production, or existing Atlas `test` database was contacted. An initial local test command was refused by preflight because the shell-expanded URI path did not match the expected database; it made no connection or writes. The corrected process-scoped loopback target passed preflight before initialization.

The overall Days 1–4 verdict remains **PARTIALLY COMPLETE** until a working browser environment can complete and inspect the purchase journey and the dataset redistribution license is clarified. The SRS and Day 4 guide also remain independently unreadable during this recheck because Word held exclusive locks.
