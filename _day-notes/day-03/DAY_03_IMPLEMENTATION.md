# UrbanKart Day 3 Implementation Notes

## Scope and requirements sources

The checkout does not contain the canonical SRS, six-day roadmap, or a separate Day 3 guide. This note records what the current code and local README/models establish; it does not claim compliance with unavailable source documents. Confirm approved requirements before extending behavior.

The existing models define a Cart with a unique `userId` and embedded `{ productId, quantity }` items, and an Order with `customerId`, item references and purchase-time name/price snapshots, `qty`, and `totalAmount`. Product has `name`, `price`, `stock`, `category`, and `attributes: [{ key, value }]`. No model was changed.

## Implemented API and request flow

All `/api/cart` routes require a valid JWT and a currently existing user. Queries are scoped to the authenticated JWT subject, so a caller cannot choose another user's cart ID.

| Route | Behavior |
|---|---|
| `GET /api/cart` | Return the caller's populated cart or an empty cart shape. |
| `POST /api/cart/items` | Validate product ID and positive integer quantity, check product and current stock, then add/increment the item. |
| `PATCH /api/cart/items/:productId` | Set an existing item's positive integer quantity after product and stock checks. |
| `DELETE /api/cart/items/:productId` | Remove the matching item from the caller's cart. |
| `DELETE /api/cart` | Clear the caller's cart. |
| `POST /api/cart/checkout` | Read the caller's cart, conditionally decrement each product, create order snapshots from current product data, and clear the cart inside one MongoDB transaction. |

Cart stock checks are advisory; cart items do not reserve stock. Checkout ignores client-supplied prices/totals and uses `Product` values read inside the transaction. Each stock update filters by product ID and `stock: { $gte: quantity }`, preventing a successful update from taking stock below zero. A failure throws before success is returned; when transactions are supported, the transaction aborts all staged writes. Unsupported transaction topology or other transaction errors return 503, and no weaker fallback is used.

Illustrative guard from the route:

```js
Product.findOneAndUpdate(
  { _id: item.productId, stock: { $gte: item.quantity } },
  { $inc: { stock: -item.quantity } },
  { new: true, session }
);
```

The guard protects one stock update. Multi-product stock decrements, order creation, and cart clearing are all-or-nothing only when the deployment supports MongoDB multi-document transactions and the actual transaction commits.

## Data integrity and security decisions

- Cart access uses the authenticated account ID; IDs supplied in URL/body identify products only.
- Quantities must be safe positive integers within signed BSON int32 range.
- Missing products return 404; insufficient current availability returns 409.
- Checkout snapshots product name and price at purchase time while preserving product references for later analytics.
- Admin product mutations use the user's current database role, so demoted or deleted accounts do not retain token-embedded admin rights.
- Cart add/update/load/save flows are not protected by an atomic per-user upsert or version check. Simultaneous cart edits can race; live database index enforcement is also unverified.
- There is no persistent order idempotency key. An already-cleared cart is rejected as empty, but a delayed replay after the user fills a new cart is not deduplicated.

## Tests and verification status

`npm test` contains offline/in-process tests. The existing cart/API tests use mocked Mongoose methods for database behavior. The simultaneous-checkout test serializes callbacks in a fake transaction harness; it is not a MongoDB concurrency test and does not prove real rollback, retry behavior, write conflicts, or Atlas topology support. Database safety tests exercise preflight failures using injected connection functions and verify that failed checks do not call them.

The local checkout database target is not safely identifiable: root `.env` has a MongoDB URI with no explicit database path or `dbName` option. No connection was attempted. Therefore database name, collection counts, indexes, validators, presence/count of the original 18 Day 1 products, current-role query behavior against MongoDB, and transaction support are **not verified**. No seed/import/write operation ran. The raw catalog CSV remains Git-ignored; its Kaggle license and currency are unverified.

### Final verification attempt (2026-10-12)

The current checkpoint is `c1c964e4ede1b39bbb18333e0279291d590818c7` on `main`, synchronized with `origin/main` before this documentation update. The working tree was clean at the start of this verification. Application startup loads root `.env` and calls `mongoose.connect(MONGODB_URI)` without a `dbName` override. A metadata-only local configuration check confirmed that a MongoDB URI is present but has no database path, no URI `dbName` option, and no separate database-name setting. No URI or credentials were printed, and MongoDB was not contacted.

The target also has not been explicitly confirmed as isolated from production/shared data. Therefore no database name/counts, collection/index/validator details, Day 1 product count, actual topology, rollback behavior, or 20-request checkout outcomes are available. Safety tooling and real integration-test entry points have now been added, but no integration run was allowed past local preflight. No database write, seed, or importer write mode ran.

### Offline safety tooling (2026-10-12)

Added `server/scripts/databaseSafety.js`, `auditDatabaseReadOnly.js`, `checkoutIntegrationCommon.js`, `testCheckoutRollback.js`, and `testCheckoutConcurrency.js`, plus package scripts. `.env.example` documents the safety-gate settings as blank by default. The audit requires `--confirm-isolated-db <name>`, `URBANKART_EXPECTED_DB_NAME`, a matching explicit database path in `MONGODB_URI` (and rejects a conflicting URI `dbName` option), and `URBANKART_DB_ENV=isolated-development`. The environment assertion is a human statement, not proof of Atlas project/cluster isolation. The test entry points additionally require a matching `URBANKART_TEST_DB_NAME` and `URBANKART_TXN_TOPOLOGY_CONFIRMED=replicaSet|sharded` before connecting; after connecting they verify MongoDB `hello` against that assertion before creating fixtures.

Audit command (not run against MongoDB):

```powershell
npm run audit:database -- --confirm-isolated-db <database-name>
```

Rollback and concurrency commands (not run against MongoDB):

```powershell
npm run test:checkout:rollback -- --confirm-test-db <database-name>
npm run test:checkout:concurrency -- --confirm-test-db <database-name>
```

The audit only lists existing collections and reads counts, validators, indexes, schema paths, `hello`, and server build/version metadata. It reports topology-level support separately from the MongoDB version requirement; this still does not prove transaction permissions or successful commits. It compares Day 1 seed names parsed statically from `seedProducts.js` without importing/executing that destructive script; matches are by name only because the Product schema has no seed provenance marker. Integration scripts use unique disposable fixtures and clean only captured user/cart/product IDs and orders tied to their unique test users. The rollback script injects an order-write failure after the real stock update, then checks stock, order, cart, and session cleanup. The concurrency script sends 20 bounded HTTP checkouts and verifies 201/409 outcomes and persisted state.

Offline verification: `npm test` includes the new fail-closed preflight tests. Running each real command with a placeholder confirmation while the expected database settings were absent returned a refusal before connection. The audit and integration scripts themselves have **not** connected or run against MongoDB; topology, rollback, persisted 20-request concurrency, and cleanup behavior remain **not verified**. The test scripts require an Atlas topology attestation before connecting because topology cannot be known without a handshake; they independently check `hello` before fixture writes.

To unblock safely, choose the isolated development/test database and confirm its cluster/environment in the local database provider dashboard. Set the root `.env` `MONGODB_URI` to that exact database by including its intended database name in the URI path (the app has no separate `dbName` option), or update the app configuration through a reviewed change to pass an explicit `dbName`. Verify locally that the selected database name and cluster correspond to the disposable non-production target. Do not paste the URI or credentials into chat. A database name containing `dev` or `test` alone is not proof of isolation.

The code review reconfirmed that cart reads and writes are scoped by the authenticated user ID; checkout derives prices from current Product records, guards each stock decrement with `stock >= qty`, and uses one session for stock/order/cart operations. `finally` ends the session. Product removal or stock reduction before checkout causes the guarded update to fail. These are code-level observations only: concurrent cart edits can race, and neither real rollback nor database concurrency is verified. The Order schema still has no persistent idempotency key, so delayed replay after a new cart is populated is not deduplicated.

The checkout contains no canonical SRS/roadmap/Day 3 guide. The source traceability basis is limited to local `README.md`, Day 1/Day 2 notes, and the actual model and route code. The DOCX companion report records the same limits.

## Local checks recorded

- `npm test`: 34 passed, 0 failed (offline preflight plus mocked/local API tests; no DB connection).
- `npm run import:products -- --dry-run` from `server/`: 20,000 rows; 19,159 valid; 841 rejected; 0 writes.
- JavaScript syntax checks: all 24 server JavaScript files passed.
- Dependency and lockfile consistency commands passed from `server/`.
- `git diff --check` passed.
- `.env`, `server/.env`, and `server/seed/data/flipkart_com-ecommerce_sample.csv` are ignored and untracked.

## Completion checklist and remaining actions

- [x] Implement authenticated cart routes and transaction-based checkout flow.
- [x] Keep client prices out of checkout calculations and preserve order snapshots.
- [x] Add mock coverage for stock conflict, checkout failure, auth regressions, and a simulated competing checkout.
- [x] Add fail-closed audit and real integration-test tools with offline preflight coverage.
- [x] Record limits without claiming live integration.
- [ ] Confirm the Atlas project/cluster is isolated, then configure expected/test database names and human environment/topology assertions locally; do not share credentials or URI.
- [ ] Run a read-only audit of collections, counts, indexes, validators, and Day 1 products only after the database identity is unambiguous.
- [x] Run rollback and 20-request final-unit checkout integration scenarios against the isolated test database; see the latest verification addendum for supplied live results.
- [ ] Review canonical SRS/roadmap requirements when available; decide if durable checkout idempotency is required.
- [ ] Verify Kaggle license/currency/stock policy before any future catalog import. Import write mode remains a separate approval gate.

## Viva-ready explanations

- **Why embed cart items?** A cart is normally read and changed as one bounded customer-owned unit. Embedding keeps its item list together; the Cart itself remains separate from User to avoid frequent cart writes changing the user record.
- **Why keep order snapshots?** Product names and prices can change later. The order stores the purchase-time values as well as the product reference so a receipt stays historically meaningful.
- **Why use a conditional stock update?** The quantity check and decrement happen in one database write. If stock is below the requested quantity, the filter matches no document and the checkout fails instead of creating negative stock.
- **Why use a transaction?** Stock, order, and cart are separate documents/collections. A transaction makes the multi-document checkout succeed or fail together, but only on a topology that supports transactions.
- **What remains unproven?** Mock tests cannot establish live topology, indexes, database validators, transaction rollback, or real concurrent outcomes. The latest addendum records two supplied live checkout scenarios on a replica set; they do not prove behavior under every production workload.

### Verification addendum (2026-10-12)

- Starting repository state: `main` at `2342c871912bcf35c533be7052dec6f64ec51daf`, matching `origin/main`; the tracked working tree was clean before this addendum.
- Offline checks completed: `npm test` passed 34 tests; `node --check` passed for 24 JavaScript files; `npm ls --depth=0` passed; `git diff --check` passed.
- Configuration was inspected without printing credentials. The URI uses the configured application account and expected cluster, but selects no database path or `dbName`; the expected database and isolation gate settings are unset. The safety tools refuse before connecting. No MongoDB connection, read-only audit, or live checkout integration test was run.
- The JWT signing secret pasted into the conversation was rotated in the ignored local `.env`; existing JWTs signed with the previous secret are invalid. The exposed Atlas database password still requires manual rotation in Atlas, followed by a local `.env` update. No credentials were included in this report.
- `.env` and the raw dataset path remain Git-ignored. No database data was read or changed, and no seed/import command ran.
- Next: rotate the Atlas application-user password in Atlas, update it locally without sharing it, confirm the Atlas project and cluster are isolated and disposable, and configure one explicit database path plus the local safety gate values. Then run the read-only audit first. Run real checkout tests only after reviewing the audit and confirming transaction-capable topology.

### Read-only audit hardening (2026-10-12)

- Actual starting repository state for this hardening task: main at 2249e5cd682518de406e6d77803ead066b256062, matching origin/main. The tracked working tree was clean before these task changes; the report files were not unstaged at inspection time.
- The audit connection now explicitly sets autoCreate=false and autoIndex=false. The audit imports only model definitions and safety helpers; model compilation declares schema metadata but does not itself issue database writes while disconnected. With both Mongoose automatic behaviors disabled, the audit uses hello/buildInfo and collection listing, counts, index/validator metadata, and a projected product-name query. It calls no model initialization, syncIndexes, createIndexes, ensureIndexes, seed, or importer write path.
- Offline tests: npm test passed 36 tests, 0 failed. Added tests verify audit preflight failure does not invoke mongoose.connect and the audit connection passes autoCreate=false and autoIndex=false. These tests verify local control flow/options only; they do not prove live database behavior.
- Syntax checks passed for 24 JavaScript files. npm ls --depth=0 and npm ls --package-lock-only --depth=0 both passed. git diff --check passed.
- Redacted local configuration inspection found the URI database path is still a placeholder, and URBANKART_EXPECTED_DB_NAME, URBANKART_DB_ENV, URBANKART_TEST_DB_NAME, and URBANKART_TXN_TOPOLOGY_CONFIRMED are unset. No credential or URI value was printed or changed. The proposed urbankart_day3_verify target was not configured.
- No MongoDB connection, audit command, checkout integration test, seed, import, or Atlas operation occurred. The existing test database and its 18 products, plus test_int, were not accessed or changed. Integration fixture cleanup remains scoped to captured user, cart, and product IDs, with orders queried only for captured fixture users.
- At the time of this addendum, the next local configuration action was to set the URI path to /urbankart_day3_verify and set URBANKART_EXPECTED_DB_NAME=urbankart_day3_verify and URBANKART_DB_ENV=isolated-development in the ignored root .env. Do not share the URI. The later audit attempt is recorded below; integration-only settings and commands remain a separate gate.

### Latest read-only audit attempt (2026-10-12)

- The requested command, npm.cmd run audit:database -- --confirm-isolated-db urbankart_day3_verify, passed local preflight and exited with code 1 after the connection/metadata phase. The script reported: Database audit could not complete; connection or metadata remains unverified.
- The diagnostic is intentionally generic. It does not establish whether MongoDB accepted the connection or whether a later metadata request failed; the cause is undiagnosed. No verified database name, topology/version, collection counts, indexes, validators, Cart index state, or Day 1 product matches are available.
- The audit command was attempted, but the audit did not return findings and is not considered successful. No checkout integration tests, seed operations, catalogue imports, or write/index/validator operations were run. The existing test database was not the configured target.
- Live rollback and concurrency behavior remain unverified. Offline unit tests do not establish Atlas transaction support, persisted rollback, or real concurrent checkout behavior.
- Current offline checkpoint checks passed: npm test reported 36 passed and 0 failed; syntax checks passed for 24 JavaScript files; npm ls --depth=0 and npm ls --package-lock-only --depth=0 passed. DOCX package and Markdown/DOCX consistency checks are recorded for this report update.

### Live checkout integration verification (2026-10-13)

The following results were supplied for successful runs against the isolated Atlas database `urbankart_day3_verify`. The reported topology was `replicaSet`. These are live database integration scenarios and are distinct from the offline unit/mock suite; they are recorded as supplied results and were not rerun during this documentation follow-up.

**Rollback scenario**

- Starting stock: 5; stock after rollback: 5.
- Failed customer orders persisted: 0; cart items preserved: 1.
- The stock update was reached, the order-creation failure was injected, and the session ended: all true.

**Twenty-request concurrency scenario**

- Concurrent requests: 20; HTTP 201 responses: 1; HTTP 409 responses: 19.
- Final stock: 0; orders created: 1.
- Successful customer's cart items: 0; failed customers' carts retained: 19.

These outcomes verify the specific rollback and last-unit contention scenarios reported for this isolated replica-set database. They do not establish correctness under every workload or production conditions. Persistent idempotency for delayed replayed checkout requests remains absent. Concurrent cart edits can still race with checkout. Index/validator state and the broader database audit remain unverified. The reported Mongoose deprecation warning was observed during those test runs; the checkout stock update now uses `returnDocument: 'after'` in place of the deprecated `new` option. No `findOneAndReplace()` application call site was identified in the repository, so the source of its reported warning remains undetermined.

### Days 1–4 local verification update (2026-10-13)

The previous paragraphs record the earlier supplied Atlas run and are historical. In the current task, user-scoped persistent checkout idempotency and order reconciliation were verified against a separate disposable local MongoDB 8.3.7 replica set. Same-key replay returned the same order, conflicting cart reuse returned 409 without stock/cart changes, concurrent same-key calls produced one persisted order, cross-user reconciliation returned 404, and a deliberately dropped HTTP response reconciled to the committed order. Injected failure after the checkout-operation write left no persisted order or operation and preserved stock/cart. The independent last-unit race produced one 201 and nineteen 409 responses; rollback preserved stock 5 and the cart. These scenarios do not prove every production failure/retry case or every cart-edit race. The current local database was task-owned and removed after verification; Atlas and the existing `test` database were untouched. The full evidence is in [`DAYS_01_04_COMPLETION.md`](../day-01-04/DAYS_01_04_COMPLETION.md).
