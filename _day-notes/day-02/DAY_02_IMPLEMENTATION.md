# UrbanKart Day 2 Implementation Notes

## Dataset and provenance

- Dataset: PromptCloudHQ, [Flipkart Products on Kaggle](https://www.kaggle.com/datasets/PromptCloudHQ/flipkart-products).
- Local filename: `server/seed/data/flipkart_com-ecommerce_sample.csv` (ignored by Git).
- The supplied CSV parsed as 20,000 records with 15 headers. The Kaggle listing describes 20,000 Flipkart products.
- The original Kaggle license could not be verified through the accessible page/API. Do not claim a particular license or redistribute the raw file based on third-party license descriptions. Verify the license in Kaggle before redistribution.
- The file has no stock or currency column. Prices are retained as numeric values as supplied; their currency is unverified.

## Import mapping and policies

| CSV field | Product mapping |
|---|---|
| `uniq_id` | Hashed, with a project/dataset namespace, into deterministic 12-byte ObjectId `_id`; the schema is unchanged. |
| `product_name` | `name` |
| `description` | Optional `description`; blank descriptions are omitted. |
| `product_category_tree` | Parse its JSON array, split the first taxonomy path on `>>`, and store the top-level category in `category`. |
| `discounted_price` | Positive numeric `price`; blank, zero, malformed, or negative values are rejected. No list-price fallback is used. |
| `product_specifications` | Parse only the supported Ruby hash-literal subset without evaluation. Entries with nonblank string key and value become `{ key, value }`; malformed specifications are omitted and counted. Value-only entries are omitted rather than assigned invented keys. |
| `brand` | Optional `{ key: "brand", value: brand }` attribute. |
| stock | Not present in the source. Dry-run uses the Product model's zero default only to validate the document shape. Database import requires an explicit `--stock-default N`; this is synthetic development inventory, never source inventory. Use `0` to keep imported listings out of stock until real inventory is supplied. |

The importer uses unordered bulk upserts in batches of 500. The deterministic `_id` supports repeat runs without a new schema field. The upsert filter also matches the expected imported shape, so a hash/ObjectId collision with a different document produces a write error instead of replacing that document. The first row for a repeated source ID or normalized product fingerprint is retained. Fingerprints use normalized name, category, price, and attributes; differing attributes remain distinct listings. Explicit stock values must fit the MongoDB validator's non-negative BSON int32 range.

## Observed dry-run findings

Run with `npm run import:products -- --dry-run` from `server/`. Latest run:

- CSV rows: 20,000; malformed CSV rows: 0.
- Valid unique product documents: 19,159; rejected: 841.
- Invalid/missing discounted prices: 78; duplicate normalized product records skipped: 763.
- Missing required name/category/source ID: 0; malformed categories: 0; model validation failures: 0.
- Repeated `uniq_id`: 0; repeated `pid`: 2 (reported, not independently dropped).
- Missing brand: 5,861; malformed specifications: 0; value-only specification pairs omitted: 11,249.
- Database writes: 0. No database connection was made during the dry-run.

## Running the importer

The default command is dry-run and does not connect to MongoDB:

```powershell
cd server
npm run import:products -- --dry-run
```

The separate write mode requires `.env` with `MONGODB_URI` and an explicit synthetic stock policy. Review the dry-run and choose the stock policy before running it:

```powershell
npm run import:products -- --import --stock-default 0
```

This command upserts only matching deterministic product IDs; it never deletes or clears the collection. It has not been run in this phase. A changed stock policy or changed data for an existing deterministic ID will not overwrite the existing row; it results in a duplicate-key write error requiring review.

## Product API and authentication

- `GET /api/health` remains public.
- `GET /api/products?page=1&limit=20&category=...&search=...` is public. The response remains an array; pagination metadata is returned in `X-Total-Count`, `X-Page`, `X-Page-Size`, and `X-Total-Pages` headers. Limits are capped at 100.
- `GET /api/products/:id` is public and validates ObjectId syntax.
- `POST /api/auth/register` validates input, hashes passwords with bcryptjs, assigns the model's default `customer` role, and returns a signed JWT.
- `POST /api/auth/login` verifies the bcrypt hash and returns a signed JWT. JWT configuration comes from `JWT_SECRET` (at least 32 UTF-8 bytes) and `JWT_EXPIRES_IN` (default `1h`).
- `POST`, `PATCH`, and `DELETE /api/products` require a valid JWT and check the account's current role in MongoDB for every mutation. JWT role claims do not grant admin access by themselves. Deleted accounts receive `401`; demoted accounts receive `403`; if the user lookup fails, the API fails closed with `503`. This adds one indexed user lookup per protected request and makes role changes effective after the database update is visible. The registration endpoint never accepts a client-supplied role. Provision an administrator only through a trusted out-of-band process; no public role-promotion endpoint exists.

Copy `.env.example` to `.env` and set `MONGODB_URI`, `JWT_SECRET`, and `JWT_EXPIRES_IN`. Never commit `.env` or real credentials.

## Verification and limits

- `npm test`: Node's built-in test runner; API tests use stubbed model methods, including the current-role database lookup, while bcrypt, JWT signing/verification, and Mongoose validation run locally. These tests do not connect to MongoDB.
- `npm run import:products -- --dry-run`: parses and validates the actual CSV without database access.
- Mocked tests do not verify the real MongoDB user query, indexes, connectivity behavior, or race timing during a concurrent role change. A successful local dry-run also does not prove the Atlas `$jsonSchema` validator, real duplicate-key handling, or a database import. Those require a separately reviewed non-production database setup.
- No product import, Atlas connection, collection clearing, or database write was performed.

## Day 2 closure audit — 2026-10-12

Checks rerun from the repository during closure:

- `npm test`: 15 passed, 0 failed. Tests cover health, public product listing and lookup, pagination, registration/login, customer/admin authorization, rejection of old admin tokens after account demotion/deletion, model validation, importer normalization, and the no-connection/no-write dry-run guarantee.
- `npm run import:products -- --dry-run`: passed against the local CSV; 20,000 rows, 19,159 valid rows, 841 rejected rows, and zero writes. Rejection/quality counters are recorded above.
- `node --check` on all 17 server JavaScript files: passed.
- `npm ls --package-lock-only --depth=0` and `npm ls --depth=0`: passed; installed dependencies match the package manifest/lockfile.
- `git diff --check`: passed. `.env`, `server/.env`, and the raw CSV are ignored; none is tracked.

Real MongoDB integration and import were **not run**. The repository root `.env` has a MongoDB URI, but it has no `JWT_SECRET`, and its URI has neither a database path nor a `dbName` option. The active target therefore cannot be positively identified as the intended development database, and authentication is not configured. No connection was attempted. Set a secure JWT secret and configure an explicitly isolated development database before repeating the read-only integration audit. Until then, pre-import product/user counts, validators, indexes, application reads, and the live role lookup are unverified. The 18 Day 1 products were not touched by this closure run because no database operation was performed; their current database presence/count was not independently verified.

The catalog import did **not** run. There are no before/after counts or inserted/updated counts to report. The Kaggle license remains unverified, currency remains unspecified, and the raw CSV remains local and Git-ignored.

The Day 3 cart/order schemas already exist in `server/models/Cart.js` and `server/models/Order.js`; preserve them unless the approved project specifications require a change. Before checkout implementation, confirm the MongoDB deployment supports transactions (for example, Atlas replica-set/sharded topology), and define atomic stock reservation/decrement, rollback on order failure, and concurrent checkout tests. No Day 3 code was added during this closure audit.

## Day 3 remains

Cart management, checkout, atomic stock decrement/transactions, order snapshots, and their concurrency tests remain for Day 3.
