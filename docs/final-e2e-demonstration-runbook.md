# UrbanKart final evaluation runbook

Date: 2026-10-14. This is a native Windows/PowerShell walkthrough for a local, disposable MongoDB replica set. It never uses the root `.env` database target. Do not copy `.env` values into commands, screenshots, or the report.

## Current audit instance

The final audit has the API and Vite running on loopback at `http://127.0.0.1:5002` and `http://127.0.0.1:5174/`, backed by isolated `urbankart_acceptance_20261014` on replica set `ukAcceptance20261014` at `127.0.0.1:27230`. The CSV dry run found 20,000 rows/19,159 valid candidates; a guarded import inserted all 19,159 and a repeat import matched all 19,159 without duplicates or failed writes. The database has 19,165 products: those imported rows plus six preserved “Academic Demo” synthetic products. The CSV contains no inventory field. On 2026-10-15, the 19,159 imported records were assigned 10 units of synthetic demo stock each so the storefront checkout can be exercised; this is not retailer inventory or a claim of real-world availability. All six preserved demo products also retain synthetic positive stock. One pre-existing customer account was preserved; the database currently has no orders or reviews. All seven collections have validators. Current catalogue and admin read endpoints, role denials, and exact temporary product CRUD were HTTP-verified. The unrelated Windows MongoDB standalone service on port 27017 was not used for writes.

The walkthrough was HTTP/API-level. Full-catalog recommendations have now been batch recomputed and persisted; a read-only count confirmed 19,165 recommendation documents for 19,165 products. Chrome previously exited with GPU process error `-1073741790`; no current GUI screenshot or visual acceptance is claimed. The app can be opened at the Vite URL for evaluator-led browser checks.

To use the current already-running instance, open `http://127.0.0.1:5174/`. The storefront is API-backed and reports the full 19,165-product total. Imported CSV records have 10 synthetic demo units each; the catalogue page and product details disclose that these quantities are for demonstration only. Register a disposable customer for checkout and access-denial checks. Sign in again if the API has restarted.

```powershell
$env:MONGODB_URI='mongodb://127.0.0.1:27230/urbankart_acceptance_20261014?replicaSet=ukAcceptance20261014'
mongosh.exe $env:MONGODB_URI --quiet --eval "const h=db.hello(); printjson({database:db.getName(),replicaSet:h.setName,isWritablePrimary:h.isWritablePrimary})"
$env:URBANKART_EXPECTED_DB_NAME='urbankart_acceptance_20261014'
$env:URBANKART_DB_ENV='isolated-development'
$env:URBANKART_TXN_TOPOLOGY_CONFIRMED='replicaSet'
$env:URBANKART_TXN_REPLICA_SET_NAME='ukAcceptance20261014'
cd 'C:\Users\Tokachichu SriCharan\OneDrive\Documents\GitHub\urbankart\server'
npm.cmd run admin:setup:local -- --confirm-local-db urbankart_acceptance_20261014
```

The setup command asks for account email/password (password input is hidden). It creates a new admin with bcrypt or verifies an existing account password before asking for the exact word `PROMOTE`; it refuses remote/non-replica-set targets and inactive accounts. Log in through the app after setup. Keep a separate customer account for the 403 check. This instance uses API port 5002 and Vite port 5174; clean-start instructions below use 5000/5173.

## Prerequisites and isolated local database

Install Node.js 20.19+ and the repository dependencies. MongoDB Server and `mongosh` must be installed. Docker is not required. The commands below start a new local replica set on port 27240; if that port or the named temp path is occupied, choose a new port/path and use it consistently. Do not point these commands at Atlas or a shared database.

**PowerShell terminal 1 — MongoDB:**

```powershell
$dataPath = Join-Path $env:TEMP 'urbankart_academic_rs_20261014'
if (Test-Path -LiteralPath $dataPath) { throw 'Choose a new empty task-owned temp directory; do not delete or reuse an unknown database path.' }
New-Item -ItemType Directory -Path $dataPath | Out-Null
mongod.exe --dbpath $dataPath --replSet ukAcademicDemo --bind_ip 127.0.0.1 --port 27240
```

Leave this terminal open. In **PowerShell terminal 2**, initiate and verify the one-member replica set:

```powershell
mongosh.exe 'mongodb://127.0.0.1:27240/admin?directConnection=true' --quiet --eval "rs.initiate({_id:'ukAcademicDemo',members:[{_id:0,host:'127.0.0.1:27240'}]})"
Start-Sleep -Seconds 5
mongosh.exe 'mongodb://127.0.0.1:27240/admin?directConnection=true' --quiet --eval "const h=db.hello(); printjson({setName:h.setName,isWritablePrimary:h.isWritablePrimary,hosts:h.hosts})"
```

Continue in terminal 2 from `server/`; `.env` is overridden only in this PowerShell process:

```powershell
$repo = 'C:\Users\Tokachichu SriCharan\OneDrive\Documents\GitHub\urbankart'
cd "$repo\server"
npm.cmd install
$env:MONGODB_URI='mongodb://127.0.0.1:27240/urbankart_academic_demo?replicaSet=ukAcademicDemo'
$env:URBANKART_EXPECTED_DB_NAME='urbankart_academic_demo'
$env:URBANKART_DB_ENV='isolated-development'
$env:URBANKART_TXN_TOPOLOGY_CONFIRMED='replicaSet'
$env:URBANKART_TXN_REPLICA_SET_NAME='ukAcademicDemo'
npm.cmd run db:init:local -- --confirm-local-db urbankart_academic_demo
# Recheck the source before writing; CSV import is safe to repeat with the same stock policy.
npm.cmd run import:products -- --dry-run
npm.cmd run import:products -- --import --stock-default 0 --confirm-local-db urbankart_academic_demo
$env:HOST='127.0.0.1'
$env:PORT='5000'
$bytes=New-Object byte[] 48
$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$env:JWT_SECRET=[Convert]::ToBase64String($bytes)
$rng.Dispose()
[Array]::Clear($bytes,0,$bytes.Length)
npm.cmd start
```

The initializer should report seven validators and 14 declared model indexes across the six SRS collections plus `checkoutoperations`. The server should log a successful MongoDB connection and `127.0.0.1:5000`. Do not print the environment or token variables. Confirm `http://127.0.0.1:5000/api/health` returns 200.

**PowerShell terminal 3 — Vite client:**

```powershell
$repo = 'C:\Users\Tokachichu SriCharan\OneDrive\Documents\GitHub\urbankart'
cd "$repo\client"
npm.cmd install
$env:URBANKART_DEV_API_PROXY='http://127.0.0.1:5000'
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/`; confirm the homepage renders and `http://127.0.0.1:5173/api/health` returns 200 through the Vite proxy.

## Prepare safe demo data and accounts

1. Register an evaluator-owned disposable account in the app. Registration always creates a customer and ignores a submitted role.
2. To provision a local admin, use the guarded setup command from a separate PowerShell terminal. For the clean-start example, set these process values first:

   ```powershell
   $repo = 'C:\Users\Tokachichu SriCharan\OneDrive\Documents\GitHub\urbankart'
   cd "$repo\server"
   $env:MONGODB_URI='mongodb://127.0.0.1:27240/urbankart_academic_demo?replicaSet=ukAcademicDemo'
   $env:URBANKART_EXPECTED_DB_NAME='urbankart_academic_demo'
   $env:URBANKART_DB_ENV='isolated-development'
   $env:URBANKART_TXN_TOPOLOGY_CONFIRMED='replicaSet'
   $env:URBANKART_TXN_REPLICA_SET_NAME='ukAcademicDemo'
   npm.cmd run admin:setup:local -- --confirm-local-db urbankart_academic_demo
   ```

   Password input is hidden. The script uses bcrypt for a new account; for an existing user it verifies the current password and requires the explicit word `PROMOTE` before changing a customer role. The command confirms the database name and live loopback replica-set identity. It never creates a public admin-registration endpoint. Keep a separate customer account for the 403 demonstration.
3. The React `/admin` page provides Overview, Users & carts, Orders, Products, Reviews and Analytics tabs. Product operations use the existing protected routes; do not delete imported records for a demonstration. Use the preserved `Academic Demo` products for checkout. Do not assign stock to imported records without identifying it as synthetic inventory.

   For the guarded recommendation refresh, open another PowerShell terminal and set the safety values again (they do not carry between terminals):

   ```powershell
   $repo = 'C:\Users\Tokachichu SriCharan\OneDrive\Documents\GitHub\urbankart'
   cd "$repo\server"
   $env:MONGODB_URI='mongodb://127.0.0.1:27240/urbankart_academic_demo?replicaSet=ukAcademicDemo'
   $env:URBANKART_EXPECTED_DB_NAME='urbankart_academic_demo'
   $env:URBANKART_DB_ENV='isolated-development'
   $env:URBANKART_TXN_TOPOLOGY_CONFIRMED='replicaSet'
   $env:URBANKART_TXN_REPLICA_SET_NAME='ukAcademicDemo'
   npm.cmd run recommendations:recompute -- --confirm-local-db urbankart_academic_demo
   ```

4. No payment gateway is configured. Checkout creates a mock order, updates stock transactionally, and clears the cart. Start with synthetic products and disposable users only.

## 7–10 minute walkthrough

| Time | Action | Expected outcome |
|---|---|---|
| 0:00-1:00 | Open storefront; point out total, browse imported records and category filters. | API reports 19,165 products (19,159 imported and six retained synthetic acceptance items); imported stock is zero. |
| 1:00-2:00 | Search `Alisha`, open an imported product detail. | Search, detail, and recommendation fallback read real CSV-derived MongoDB records. |
| 2:00-3:00 | Visit first, middle, and last catalogue pages; filter `Clothing`. | 12 per page, correct total/page count, 265 distinct categories; category/text indexes support queries. |
| 3:00-4:00 | Search `Academic Demo`, register/log in as a disposable customer. | The clearly labeled synthetic checkout item has positive stock; imported items do not. |
| 4:00-5:30 | Add/update/remove/re-add the synthetic item and check out. | User-scoped cart, transactional order snapshot/stock decrement; payment is mocked. |
| 5:30-6:30 | Provision/log in as local admin; visit `/admin` Overview and Analytics. | Database-backed product/category/account/order/review/cart metrics and persisted analytics or honest empty state. |
| 6:30-7:30 | Inspect Users & carts, Orders, Products, Reviews; test customer 403. | Safe user fields, current cart, order snapshots, protected product actions, read-only review list. |
| 7:30-9:00 | In Compass or `mongosh`, inspect attributes, carts, orders, validators, TTL and indexes; show explain stats. | Explain Attribute Pattern, snapshots, validators and measured query plans using only the isolated database. |
| 9:00-10:00 | State remaining scope and rights limits. | No review form, general order-history/status workflow, seller tenancy, trend prediction, Change Streams, or vector search; redistribution remains AMBER. |

To populate revenue/top-product charts during an academic demo, a checkout order must have a sales status (`completed`, `shipped`, or `delivered`). The project has no order-status management UI/API. If the evaluator specifically asks to see the revenue branch, update **only the ObjectId of your own synthetic order** in the confirmed disposable database via Compass/mongosh, then refresh admin analytics; disclose that the status transition was a demo fixture action, not an application workflow. Otherwise, show the real `pending` count and explain the sales-status filter.

For that optional synthetic-order status demonstration, set/verify the local `$env:MONGODB_URI` as above, then substitute the exact order ObjectId returned by your own checkout:

```powershell
$orderId = Read-Host 'Synthetic checkout order ObjectId'
if ($orderId -notmatch '^[a-fA-F0-9]{24}$') { throw 'Expected a 24-character ObjectId.' }
mongosh.exe $env:MONGODB_URI --quiet --eval "const r=db.orders.updateOne({_id:ObjectId('$orderId')}, {`$set:{status:'completed'}}); printjson({matched:r.matchedCount,modified:r.modifiedCount})"
```

Confirm the matched count is exactly 1. This is a local evaluation fixture adjustment, not an order-management feature.

There is no review form in the React app. The backend routes are public `GET /api/reviews/product/:productId` and `GET /api/reviews/:id`, authenticated `POST /api/reviews`, and author-only `PATCH`/`DELETE /api/reviews/:id`. The live isolated HTTP audit exercised these routes, including 403 ownership denial and aggregate updates.

## Recovery and cleanup

- **Transaction error / standalone topology:** confirm the app URI uses the disposable local replica-set name and `db.hello().setName` matches. MongoDB standalone port 27017 is not suitable for checkout transactions.
- **API cannot connect:** verify `MONGODB_URI` is process-scoped to `127.0.0.1:27240/urbankart_academic_demo`, primary is writable, and API logs contain no connection failure. Never solve this by falling back to `.env`/Atlas.
- **Vite proxy error:** verify API health on port 5000 and `URBANKART_DEV_API_PROXY` points to `http://127.0.0.1:5000` in the Vite process.
- **Port conflict:** choose unused loopback ports, update the URI/API proxy and browser URLs consistently. Do not stop an unidentified process.
- **Screenshots:** no screenshots were captured in this audit. Capture genuine evaluation-machine screenshots only after the browser renders successfully; never use HTTP checks as visual evidence.
- **Cleanup:** retain the disposable database if needed for evaluation. If removing only this run's fixtures, use the captured ObjectIds/emails to delete their reviews, recommendations (source and related product IDs), carts, checkout operations, orders, products, and test users. Verify each ID belongs to the synthetic run first. Do not use `dropDatabase`, broad `deleteMany({})`, or delete any non-demo user/order/product. Stop only the exact MongoDB/API/Vite processes started for the demo when finished; keep or archive the task-owned temp database unless its ownership is certain.

This runbook is an academic demonstration procedure, not a production deployment guide or legal clearance for redistributing dataset-derived material.
