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

`npm test` currently contains 22 tests and uses in-process HTTP plus mocked Mongoose methods for API/database behavior. Tests include user-scoped cart lookup, rejection of invalid product IDs and missing products, and checkout behavior. The simultaneous-checkout test serializes callbacks in a fake transaction harness. It verifies route logic under that simulation; it is not a MongoDB concurrency test and does not prove real transaction rollback, retry behavior, write conflicts, or Atlas topology support.

The local checkout database target is not safely identifiable: root `.env` has a MongoDB URI with no explicit database path or `dbName` option. No connection was attempted. Therefore database name, collection counts, indexes, validators, presence/count of the original 18 Day 1 products, current-role query behavior against MongoDB, and transaction support are **not verified**. No seed/import/write operation ran. The raw catalog CSV remains Git-ignored; its Kaggle license and currency are unverified.

### Final verification attempt (2026-10-12)

The current checkpoint is `c1c964e4ede1b39bbb18333e0279291d590818c7` on `main`, synchronized with `origin/main` before this documentation update. The working tree was clean at the start of this verification. Application startup loads root `.env` and calls `mongoose.connect(MONGODB_URI)` without a `dbName` override. A metadata-only local configuration check confirmed that a MongoDB URI is present but has no database path, no URI `dbName` option, and no separate database-name setting. No URI or credentials were printed, and MongoDB was not contacted.

The target also has not been explicitly confirmed as isolated from production/shared data. Therefore all read-only audit and real integration phases stopped at the safety gate: no database name/counts, collection/index/validator details, Day 1 product count, topology, rollback behavior, or 20-request checkout outcomes are available. No integration-test script was added because there is no safely allowlisted test database. No database write, seed, or importer write mode ran.

To unblock safely, choose the isolated development/test database and confirm its cluster/environment in the local database provider dashboard. Set the root `.env` `MONGODB_URI` to that exact database by including its intended database name in the URI path (the app has no separate `dbName` option), or update the app configuration through a reviewed change to pass an explicit `dbName`. Verify locally that the selected database name and cluster correspond to the disposable non-production target. Do not paste the URI or credentials into chat. A database name containing `dev` or `test` alone is not proof of isolation.

The code review reconfirmed that cart reads and writes are scoped by the authenticated user ID; checkout derives prices from current Product records, guards each stock decrement with `stock >= qty`, and uses one session for stock/order/cart operations. `finally` ends the session. Product removal or stock reduction before checkout causes the guarded update to fail. These are code-level observations only: concurrent cart edits can race, and neither real rollback nor database concurrency is verified. The Order schema still has no persistent idempotency key, so delayed replay after a new cart is populated is not deduplicated.

The checkout contains no canonical SRS/roadmap/Day 3 guide. The source traceability basis is limited to local `README.md`, Day 1/Day 2 notes, and the actual model and route code. The DOCX companion report records the same limits.

## Local checks recorded

- `npm test`: 22 passed, 0 failed (mocked/local tests; no DB connection).
- `npm run import:products -- --dry-run` from `server/`: 20,000 rows; 19,159 valid; 841 rejected; 0 writes.
- JavaScript syntax checks: all 18 server JavaScript files passed.
- Dependency and lockfile consistency commands passed from `server/`.
- `git diff --check` passed.
- `.env`, `server/.env`, and `server/seed/data/flipkart_com-ecommerce_sample.csv` are ignored and untracked.

## Completion checklist and remaining actions

- [x] Implement authenticated cart routes and transaction-based checkout flow.
- [x] Keep client prices out of checkout calculations and preserve order snapshots.
- [x] Add mock coverage for stock conflict, checkout failure, auth regressions, and a simulated competing checkout.
- [x] Record limits without claiming live integration.
- [ ] Configure the intended isolated development database name locally and confirm it is non-production; do not send credentials or URI in chat.
- [ ] Run a read-only audit of collections, counts, indexes, validators, and Day 1 products only after the database identity is unambiguous.
- [ ] Verify replica-set/sharded transaction support, then run rollback and 20-request final-unit checkout integration tests against an isolated test database.
- [ ] Review canonical SRS/roadmap requirements when available; decide if durable checkout idempotency is required.
- [ ] Verify Kaggle license/currency/stock policy before any future catalog import. Import write mode remains a separate approval gate.

## Viva-ready explanations

- **Why embed cart items?** A cart is normally read and changed as one bounded customer-owned unit. Embedding keeps its item list together; the Cart itself remains separate from User to avoid frequent cart writes changing the user record.
- **Why keep order snapshots?** Product names and prices can change later. The order stores the purchase-time values as well as the product reference so a receipt stays historically meaningful.
- **Why use a conditional stock update?** The quantity check and decrement happen in one database write. If stock is below the requested quantity, the filter matches no document and the checkout fails instead of creating negative stock.
- **Why use a transaction?** Stock, order, and cart are separate documents/collections. A transaction makes the multi-document checkout succeed or fail together, but only on a topology that supports transactions.
- **What remains unproven?** Mock tests cannot establish live topology, indexes, database validators, transaction rollback, or real concurrent outcomes. Those require the explicitly identified isolated database and integration tests.
