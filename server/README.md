# UrbanKart API

Node.js, Express, Mongoose, and MongoDB backend for the UrbanKart CSE494 project. The root `.env` is loaded by `server.js`; never commit it or pass its contents to logs. Server startup disables Mongoose automatic collection and index creation. Use an explicit migration/initializer for schema changes.

## Data model

The six SRS collections are `products`, `users`, `carts`, `orders`, `reviews`, and `recommendations`. Checkout adds the operational `checkoutoperations` collection for persistent, user-scoped idempotency. Product specifications preserve the existing Attribute Pattern `attributes: [{ key, value }]`. Cart items and order snapshots are embedded because they are bounded and read with their parent; user/product relationships are references. Reviews remain separate to avoid unbounded growth on Product. Recommendations are a nightly, explainable content-similarity materialized view, refreshed by `jobs/recommendationScheduler.js` and read with a labelled same-category fallback.

`scripts/initLocalDatabase.js` installs seven strict MongoDB `$jsonSchema` validators and declared indexes. It requires an explicit `--confirm-local-db <name>`, an exact URI path/database match, `URBANKART_DB_ENV=isolated-development`, a literal loopback `mongodb://` URI, an explicit replica-set name, and a live writable-primary `hello` check whose members are all loopback. `scripts/testDatabaseValidation.js` then attempts one invalid synthetic document per collection and requires MongoDB validation error 121. These checks do not alter Atlas.

## API

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Process health |
| `GET /api/products?page=&limit=&search=&category=&sort=` | Public | Text search, exact category filter, pagination, and sort; array response plus `X-Total-*` headers |
| `GET /api/products/categories` | Public | Sorted categories observed in MongoDB |
| `GET /api/products/:id` | Public | Product detail |
| `GET /api/products/:id/recommendations` | Public | Up to five cached, explained related products; falls back to same-category products when the cache is missing or stale |
| `POST /api/products` | Current database admin | Create whitelisted product fields |
| `PATCH /api/products/:id` | Current database admin | Update whitelisted product fields |
| `DELETE /api/products/:id` | Current database admin | Delete product |
| `GET /api/reviews/product/:productId?page=&limit=` | Public | Paginated product reviews, newest first, with total/page headers |
| `GET /api/reviews/:id` | Public | Retrieve one review |
| `POST /api/reviews` | Signed in | Create a review for an existing product; author ID is taken from the current account |
| `PATCH /api/reviews/:id` | Review author | Update rating and/or text |
| `DELETE /api/reviews/:id` | Review author | Delete a review |
| `POST /api/auth/register` | Public | bcrypt password hash, customer role, JWT and public user response |
| `POST /api/auth/login` | Public | Verify credentials and return JWT/public user |
| `GET /api/users?page=&limit=` | Current database admin | Paginated customer list; password hashes are never selected or returned |
| `POST /api/users` | Current database admin | Create a customer with a bcrypt-hashed password; role is always `customer` |
| `GET /api/users/:id` | Current database admin | Read a customer's safe profile fields |
| `PATCH /api/users/:id` | Current database admin | Update an active customer's name and/or email |
| `DELETE /api/users/:id` | Current database admin | Anonymize and deactivate a customer while retaining order references |
| `GET /api/users/me` | Signed in | Public profile fields only |
| `PATCH /api/users/me` | Signed in | Update the profile name only |
| `DELETE /api/users/me` | Signed-in customer | Anonymize and deactivate the caller; retained orders keep the user reference |
| `GET /api/admin/dashboard` | Current database admin | Single `$facet` aggregation for revenue by current product category, top five units sold, and every order status |
| `GET /api/admin/overview` | Current database admin | Product/category, active-account, order/status, review/rating and active-cart metrics from MongoDB |
| `GET /api/admin/users?page=&limit=&search=` and `/api/admin/users/:id` | Current database admin | Paginated safe user fields and detail; no password hashes or tokens |
| `GET /api/admin/users/:id/cart` | Current database admin | Read-only view of the selected user's current cart and current-price total |
| `GET /api/admin/orders?page=&limit=` and `/api/admin/orders/:id` | Current database admin | Paginated order snapshots and details; no status mutation workflow |
| `GET /api/admin/reviews?page=&limit=` | Current database admin | Paginated persisted reviews with safe product/customer projections |
| `GET /api/cart` | Signed in | Read the caller's populated cart |
| `POST /api/cart/items` | Signed in | Add a product and bounded quantity |
| `PATCH /api/cart/items/:productId` | Signed in | Set quantity |
| `DELETE /api/cart/items/:productId` | Signed in | Remove an item |
| `DELETE /api/cart` | Signed in | Clear the caller's cart |
| `POST /api/cart/checkout` | Signed in | Transactional checkout; requires `Idempotency-Key` |
| `GET /api/cart/checkout/:key` | Signed in | Reconcile only the caller's checkout result |

Registration ignores client roles. Protected admin mutations load the current user role from MongoDB, so deleted or demoted admins lose access. Profile editing is limited to `name`. Customer self-closure replaces the name, email, and password hash with non-identifying tombstone values and marks the account inactive; existing order references remain intact. Inactive accounts cannot log in or use an old token. Administrator self-closure is rejected.

Administrative user CRUD is limited to customer accounts. Admin routes never accept a role or `isActive` field; new accounts are always customers, and existing administrator provisioning remains a trusted out-of-band operation. Create responses and customer reads omit password hashes. Deletion anonymizes/deactivates instead of physically deleting so historical order references remain valid. Offline route tests cover current-role authorization, whitelisted fields, password hashing, and tombstone behavior; this does not replace live browser verification.

Reviews use the SRS `productId`, `userId`, `rating`, and optional `text` fields in the referenced `reviews` collection. `userId` comes from the authenticated account; rating is an integer from 1 through 5; text is trimmed and limited to 4,000 characters. Public reads support `page` and `limit` (default 1 and 20, maximum 100); list responses use `{ status, reviews }` and `X-Total-Count`, `X-Page`, and `X-Page-Size` headers. Single-review reads return `{ status, review }`. Create returns that shape with HTTP 201; update returns it with HTTP 200; delete returns `{ status, message }` with HTTP 200. Malformed values return 400, missing authentication 401, non-author mutations 403, missing products/reviews 404, and sanitized storage failures 500. Mutations run in a MongoDB transaction and recompute Product `ratingAvg`/`ratingCount` from the review collection, so edits and deletions are reflected accurately. A user may create more than one review per product because neither the SRS nor existing index imposes uniqueness. Verified purchase is not required by the SRS. Admins have no ownership override: update/delete require the author. This backend CRUD does not add a customer review UI because the SRS storefront feature list does not require one.

## Safe local setup

On Windows PowerShell, install dependencies with `npm.cmd install`. Configure root `.env` with placeholders from `../.env.example` only after choosing the database. For local schema work, start a fresh disposable MongoDB replica set bound to `127.0.0.1`; independently verify its `hello` identity. In the same PowerShell process as the commands, configure process-scoped values (do not paste them into source control):

```powershell
$env:MONGODB_URI='mongodb://127.0.0.1:27017/urbankart_local?replicaSet=ukLocal'
$env:URBANKART_EXPECTED_DB_NAME='urbankart_local'
$env:URBANKART_DB_ENV='isolated-development'
$env:URBANKART_TXN_TOPOLOGY_CONFIRMED='replicaSet'
$env:URBANKART_TXN_REPLICA_SET_NAME='ukLocal'
npm.cmd run db:init:local -- --confirm-local-db urbankart_local
npm.cmd run test:db:validation -- --confirm-local-db urbankart_local
```

The process values override dotenv only for that shell/process. They are not evidence by themselves: the scripts also parse the URI and verify the connected local replica-set primary and every advertised host. Never run these write commands against Atlas or a shared database. The Day 1 sample seed is also local-gated and uses deterministic `$setOnInsert` upserts without clearing existing products:

```powershell
node seed/seedProducts.js --confirm-local-db urbankart_local
```

The CSV importer applies the same complete local-member gate before its bounded upserts.

## Day 5 recommendations and analytics

The recommendation score is weighted Jaccard over normalized, unique product tags and `{ key, value }` attributes, plus a `0.2` same-category bonus, capped at `1`. Stored matches include their common tags/attributes and score components. The job ranks candidates deterministically, stores at most five per product, and runs daily at 02:00 in `Asia/Kolkata` by default. `RECOMMENDATION_CRON_SCHEDULE` and `RECOMMENDATION_TIMEZONE` can override that schedule. The job does not recompute the full catalogue during server startup. To run a deliberate local refresh, first point process-scoped safety settings at a separately confirmed disposable loopback replica set, then run:

```powershell
npm.cmd run recommendations:recompute -- --confirm-local-db <database-name>
```

Admin analytics include `completed`, `shipped`, and `delivered` items in revenue and top-unit counts. Revenue uses historical `priceAtPurchase * qty`; because orders do not snapshot product category, category uses the current Product record. A deleted or missing Product is reported as `Unattributed`. Status counts include all orders. No currency is inferred. The API loads the caller's current database role before aggregation; customers receive `403`.

Day 5 implementation details, source-document mapping, isolated database evidence, and limitations are recorded in [`docs/day-5-recommendations-analytics.md`](../docs/day-5-recommendations-analytics.md).

## Dataset import

The local ignored file `seed/data/flipkart_com-ecommerce_sample.csv` is the PromptCloudHQ Flipkart Products dataset. The Kaggle dataset page declares [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); record its source and transformation attribution and keep the raw CSV out of Git. The declaration does not establish the uploader's authority over retailer descriptions, trademarks, or linked image assets. Overall redistribution clearance remains AMBER; see [`docs/dataset-provenance.md`](../docs/dataset-provenance.md). The importer requires `uniq_id`, `product_name`, `product_category_tree`, and `discounted_price`; it maps specifications/brand to `{ key, value }`, uses deterministic IDs, validates rows, and writes bounded batches. The source has no stock or explicit currency field. A write therefore requires an explicit inventory policy such as `--stock-default 0` and does not add a currency field.

```powershell
npm.cmd run import:products -- --dry-run
# Only for a separately confirmed disposable local database:
npm.cmd run import:products -- --import --stock-default 0 --confirm-local-db urbankart_local
```

Historical import evidence before 2026-10-14 described a separate task-owned local database. The acceptance import and original API count are recorded in [catalog recovery evidence](../docs/evidence/final-catalog-recovery-2026-10-14.json). The dry run parsed 20,000 rows: 19,159 valid normalized products and 841 rejects; a guarded import inserted 19,159 into `urbankart_acceptance_20261014`, and a repeat import matched all rows without adding duplicates. On 2026-10-15, the active local demo assigned 10 units of synthetic stock to each imported product so checkout can be demonstrated. The source has no inventory field, so these quantities are not retailer inventory. The active API serves 19,165 records including six preserved synthetic demo products. Price values remain currency-unspecified.

### Guarded local administrator setup

Use `npm.cmd run admin:setup:local -- --confirm-local-db <database-name>` after setting the explicit loopback replica-set URI, expected database name, `URBANKART_DB_ENV=isolated-development`, transaction-topology confirmation, and replica-set name. The command prompts for email and a hidden password, creates an admin with bcrypt or verifies an existing account password and requires explicit `PROMOTE` confirmation before role change. It refuses remote targets, unknown database names, standalone topology, and inactive accounts. Never expose admin creation through a public route. See the [final evaluation runbook](../docs/final-e2e-demonstration-runbook.md) for exact PowerShell commands.

### Persistent local development catalog

A separate local development catalog is stored outside the repository and OneDrive at `%LOCALAPPDATA%\UrbanKart\mongodb-day1-4-dev`. It uses replica set `ukLocalDev` on loopback port `27020`, database `urbankart_local_dev`, and currently contains 19,159 imported products. The importer assigned stock `0` because the source has no inventory field; the catalog is browseable but cannot support a purchase until a separate, clearly synthetic inventory policy is chosen. The Kaggle page declares CC BY-SA 4.0, while overall redistribution clearance remains AMBER because uploader authority and third-party retailer content/image rights are not fully verified. Keep the CSV and retailer images out of Git; see [`docs/dataset-provenance.md`](../docs/dataset-provenance.md).

To start MongoDB in a PowerShell window:

```powershell
$localData = Join-Path $env:LOCALAPPDATA 'UrbanKart\mongodb-day1-4-dev'
New-Item -ItemType Directory -Force (Join-Path $localData 'db') | Out-Null
$mongod = (Get-Command mongod).Source
$arguments = '--replSet ukLocalDev --bind_ip 127.0.0.1 --port 27020 --dbpath "{0}" --logpath "{1}" --logappend' -f (Join-Path $localData 'db'), (Join-Path $localData 'mongod.log')
Start-Process -FilePath $mongod -ArgumentList $arguments -WindowStyle Hidden
```

On first-time setup only, initialize the local replica set and confirm the live member is loopback:

```powershell
mongosh 'mongodb://127.0.0.1:27020/admin' --quiet --eval "rs.initiate({ _id: 'ukLocalDev', members: [{ _id: 0, host: '127.0.0.1:27020' }] })"
mongosh 'mongodb://127.0.0.1:27020/admin' --quiet --eval "db.adminCommand({ hello: 1 })"
```

Only after that confirmation, initialize and import into the explicitly named local database. These process-scoped values override the root `.env` for these commands and must not be copied into it:

```powershell
cd server
$env:MONGODB_URI='mongodb://127.0.0.1:27020/urbankart_local_dev?replicaSet=ukLocalDev'
$env:URBANKART_EXPECTED_DB_NAME='urbankart_local_dev'
$env:URBANKART_DB_ENV='isolated-development'
$env:URBANKART_TXN_TOPOLOGY_CONFIRMED='replicaSet'
$env:URBANKART_TXN_REPLICA_SET_NAME='ukLocalDev'
npm.cmd run db:init:local -- --confirm-local-db urbankart_local_dev
npm.cmd run import:products -- --import --stock-default 0 --confirm-local-db urbankart_local_dev
npm.cmd start
```

In a second PowerShell window, start the frontend with the loopback API proxy:

```powershell
cd client
$env:URBANKART_DEV_API_PROXY='http://127.0.0.1:5000'
npm.cmd run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/`. Stop Express and Vite with `Ctrl+C`; stop MongoDB with `mongosh 'mongodb://127.0.0.1:27020/admin' --quiet --eval "db.adminCommand({ shutdown: 1 })"`. The server may close the shell connection while the shutdown command completes. The database remains in LocalAppData for the next start. Do not point either command at Atlas or the existing `test` database.

## Checkout behavior

Checkout reads the authenticated server-side cart and current Product records. In one MongoDB transaction, it conditionally decrements stock, writes immutable name/price/quantity snapshots into Order, writes the user/key/fingerprint mapping, and clears the cart. The unique `{ userId, key }` index prevents duplicate operations. Same-key retries resolve to the original order; conflicting cart intent returns `409`. The UI preserves one key and reconciles uncertain results; it never reports an unconfirmed order as success. No payment, shipping, tax, address, or currency behavior is implemented.

## Checks

```powershell
npm.cmd test
npm.cmd ls --depth=0
npm.cmd ls --package-lock-only --depth=0
```

`npm.cmd test` is the offline Node test suite, including mocked API/model behavior and database-safety preflight tests. The database validator command and `test:checkout:*` scripts are real database tests and require the explicit local replica-set gate. The latest academic audit reran 88 server tests and passed; historical isolated runs verified validator rejection, same-key replay/conflict and lost-response reconciliation, rollback, and a 20-request last-unit race on a disposable MongoDB 8.3.7 replica set. See the final evaluation runbook and requirements traceability for current evidence and limits. No Atlas or production database was contacted during the latest local audit.
