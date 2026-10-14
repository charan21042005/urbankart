# UrbanKart final evaluation runbook

Date: 2026-10-14. This is a native Windows/PowerShell walkthrough for a local, disposable MongoDB replica set. It never uses the root `.env` database target. Do not copy `.env` values into commands, screenshots, or the report.

## Current audit instance

The final audit has the API and Vite running on loopback at `http://127.0.0.1:5002` and `http://127.0.0.1:5174/`, respectively, backed by the isolated `urbankart_acceptance_20261014` database on replica set `ukAcceptance20261014` at `127.0.0.1:27230`. The server and Vite proxy health checks returned 200. The customer/admin HTTP walkthrough passed and its test accounts, checkout products, reviews, carts, orders, and checkout records were removed by captured IDs. I then prepared six original synthetic catalog products and six recommendation cache documents for immediate browsing; the database has zero users and orders. The acceptance database has seven validated collections. The unrelated Windows MongoDB service on port 27017 is a standalone server; it was not used for writes.

The walkthrough was HTTP/API-level. Chrome previously exited with GPU process error `-1073741790`; no current GUI screenshot or visual acceptance is claimed. The app can be opened at the Vite URL for evaluator-led browser checks.

To use the current already-running instance, open `http://127.0.0.1:5174/`. It has six synthetic products with recommendation caches; register a disposable customer to demonstrate browsing/cart/checkout. To provision a separate admin for this instance, register another disposable account, then in a PowerShell terminal run the following only after verifying the printed DB and replica-set identity. Log in again after promotion. Keep a separate customer account for the 403 check.

```powershell
$env:MONGODB_URI='mongodb://127.0.0.1:27230/urbankart_acceptance_20261014?replicaSet=ukAcceptance20261014'
mongosh.exe $env:MONGODB_URI --quiet --eval "const h=db.hello(); printjson({database:db.getName(),replicaSet:h.setName,isWritablePrimary:h.isWritablePrimary})"
$adminEmail = Read-Host 'Registered disposable account email'
if ($adminEmail -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') { throw 'Enter the email of the disposable account you just registered.' }
mongosh.exe $env:MONGODB_URI --quiet --eval "const r=db.users.updateOne({email:'$adminEmail'}, {`$set:{role:'admin'}}); printjson({matched:r.matchedCount,modified:r.modifiedCount})"
```

This current instance uses API port 5002 and Vite port 5174. The later clean-start instructions below use API 5000 and Vite 5173 instead.

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
2. If demonstrating the admin dashboard, promote only that disposable account out of band in the **confirmed local academic database**, then log in again to obtain a fresh session. In a separate PowerShell terminal, set and verify the same local-only URI before running the update:

   ```powershell
   $env:MONGODB_URI='mongodb://127.0.0.1:27240/urbankart_academic_demo?replicaSet=ukAcademicDemo'
   mongosh.exe $env:MONGODB_URI --quiet --eval "const h=db.hello(); printjson({database:db.getName(),replicaSet:h.setName,isWritablePrimary:h.isWritablePrimary})"
   $adminEmail = Read-Host 'Registered disposable account email'
   if ($adminEmail -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') { throw 'Enter the email of the disposable account you just registered.' }
   mongosh.exe $env:MONGODB_URI --quiet --eval "const r=db.users.updateOne({email:'$adminEmail'}, {`$set:{role:'admin'}}); printjson({matched:r.matchedCount,modified:r.modifiedCount})"
   ```

   This is trusted local provisioning, not a public admin-registration feature. Never run it unless the replica-set/database identity checks match the values above. Keep a separate customer account for the access-denial demonstration.
3. Product CRUD is exposed by the protected API; the storefront has no product-management page. This PowerShell sequence prompts for the disposable admin credentials without printing the password/token, logs in, and creates two synthetic products. Run it after promoting the admin and logging in again; do not paste credentials into shell history. Do not import the raw Kaggle CSV merely for the demo.

   ```powershell
   $adminEmail = Read-Host 'Admin email'
   $securePassword = Read-Host 'Admin password' -AsSecureString
   $adminPassword = [Net.NetworkCredential]::new('', $securePassword).Password
   $loginBody = @{ email=$adminEmail; password=$adminPassword } | ConvertTo-Json -Compress
   $login = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/auth/login' -Method Post -ContentType 'application/json' -Body $loginBody
   $adminToken = $login.token
   $headers = @{ Authorization = "Bearer $adminToken" }
   $first = @{ name='Demo Wireless Keyboard'; description='Synthetic academic demo item'; category='Demo Electronics'; price=25; stock=10; tags=@('demo','wireless','keyboard'); attributes=@(@{key='Connectivity';value='Wireless'}) }
   $second = @{ name='Demo Wireless Mouse'; description='Synthetic academic demo item'; category='Demo Electronics'; price=15; stock=10; tags=@('demo','wireless','mouse'); attributes=@(@{key='Connectivity';value='Wireless'}) }
   $p1 = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/products' -Method Post -Headers $headers -ContentType 'application/json' -Body ($first | ConvertTo-Json -Depth 5 -Compress)
   $p2 = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/products' -Method Post -Headers $headers -ContentType 'application/json' -Body ($second | ConvertTo-Json -Depth 5 -Compress)
   Remove-Variable securePassword,adminPassword,loginBody,login,adminToken,headers
   ```

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
| 0:00–1:00 | Open the storefront; browse the synthetic catalog and category filter. | Product cards use original abstract category artwork; stock and prices come from the local API. |
| 1:00–2:00 | Search for one demo product, open its details. | Search/filter and product detail show the API-backed record. |
| 2:00–3:00 | Show “You might also like”. | Related product has a stored score and shared-tag/attribute explanation; if no fresh cache exists, the API labels the category fallback. |
| 3:00–4:00 | Register/log in as a disposable customer. Add a stock-positive demo product, change quantity, remove/re-add it. | Cart operations are scoped to the signed-in user and reject quantities above stock. |
| 4:00–5:30 | Check out once. | Confirmation shows the server-created order ID/total; MongoDB has a name/price snapshot, stock is decremented, cart is empty. Payment is mocked. |
| 5:30–6:30 | Log in as the separately provisioned local admin; refresh `/admin`. | `$facet` dashboard renders order-status data. A new checkout is `pending`, so revenue/top-seller charts may be empty by design. |
| 6:30–7:30 | Log in as the normal customer and request `/api/admin/dashboard` using the customer token (or try `/admin`). | API returns 403 for a customer; protected analytics are not disclosed. |
| 7:30–9:00 | In Compass or `mongosh`, inspect `products.attributes`, `carts.items`, `orders.items`, reviews/recommendations, validators, TTL, text/category indexes, and unique user email index. | Explain Attribute Pattern, embedded cart/order snapshots, referenced reviews, TTL index, indexes/EXPLAIN, and seven validators. Use synthetic/demo database only. |
| 9:00–10:00 | State honest limits and optional backend review check. | Review CRUD exists at the API, but there is no storefront review form. The Roadmap's final React-UI checklist asks for review operations; this remains a roadmap gap, not a formal SRS M6/FR requirement. Explain no seller tenancy, order-history management API, trend forecast, Change Streams, or vector search. |

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
