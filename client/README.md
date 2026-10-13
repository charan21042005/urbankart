# UrbanKart Client

React storefront for the UrbanKart e-commerce project. Stage A's editorial paper, ink, rust, and olive design system remains the visual foundation. Stage B supplies shared API, authentication, and cart state. Stage C connects catalogue, product detail, login/registration, and cart editing screens to the existing backend. Stage D hardens cart response handling and uncertain cart mutations. Stage H adds API-connected checkout with persisted user-scoped idempotency and authenticated reconciliation, verified against a disposable local replica set.

## Local setup

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```powershell
cd client
npm install
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`. The frontend scripts are `npm run dev`, `npm run build`, `npm run preview`, and `npm test`.

## API configuration

The development default is same-origin `/api`; Vite proxies those requests to `http://localhost:5000`, avoiding browser CORS during local development. Set `VITE_API_BASE_URL` in `client/.env.local` only when using another API base URL:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

The URL includes `/api`; the API modules append route paths. The current Express server does not configure CORS, so a separately hosted frontend must use same-origin routing or a deployment proxy; a direct cross-origin URL will need server-side CORS support. Vite-exposed `VITE_` values are public. Never put passwords, JWT secrets, database URIs, or other private values in them.

## Stage C routes and verified backend contract

- `/` loads the catalogue from `GET /api/products?page=&limit=&search=&category=`. `page` and `limit` must be positive integers; the server defaults to page 1 and limit 20 and caps the limit at 100. Search is a case-insensitive match against product name or description; category is an exact category match. Pagination totals come from `X-Total-Count`, `X-Page`, `X-Page-Size`, and `X-Total-Pages` response headers. Search is debounced and filters are represented in the URL. Category choices are gathered from products returned by pages already visited because the backend has no category-list endpoint.
- `/products/:id` loads one record with `GET /api/products/:id`. Product fields currently defined by the server are `_id`, `name`, optional `description`, numeric `price`, integer `stock`, `category`, `attributes` as `{ key, value }` pairs, and timestamps. There is no product-image field or currency field in the schema. Product artwork in the client is an abstract local placeholder, not a product photograph. Prices are displayed as the API number without a currency symbol.
- `/login` calls `POST /api/auth/login` with `{ email, password }`; `/register` calls `POST /api/auth/register` with `{ name, email, password }`. Registration accepts a 1–100 character name, valid email up to 254 characters, and a password between 8 and 72 UTF-8 bytes. The server assigns the customer role and responds with a bearer token and public user data.
- `/cart` uses authenticated `GET /api/cart`, which returns `items` with populated product references containing `name`, `price`, `stock`, and `category`. Cart editing uses `POST /api/cart/items`, `PATCH /api/cart/items/:productId`, `DELETE /api/cart/items/:productId`, and `DELETE /api/cart`. Successful edits are followed by a cart read to refresh populated details. Cart totals are client-side display estimates based on those returned product prices; no currency is supplied.
- The frontend does not call the backend checkout or order-creation endpoint. No checkout, payment, delivery, product image delivery, or server-provided currency formatting is implemented in the client.

## Stage E checkout contract review (source-verified; not live-integrated)

- The Express route is `POST /api/cart/checkout` and requires a valid bearer token. It reads the authenticated user's persisted cart; the request body is not used, so client-supplied totals or prices are not authoritative.
- On success, the route responds with HTTP `201` and `{ status: 'success', order }`. The order contains `customerId`, item snapshots (`productId`, `nameAtPurchase`, `priceAtPurchase`, `qty`), `totalAmount`, `status`, `orderDate`, and Mongoose timestamps. The initial status is `pending`.
- The backend derives prices from current product documents, conditionally decrements stock only where `stock >= quantity`, creates the order, and clears the user's cart inside a Mongoose transaction. Empty carts and unavailable/insufficient-stock items return `409`. Other transaction or confirmation failures return `503` with a message that the result may be uncertain. Transactions require a transaction-capable MongoDB topology.
- There is no persistent idempotency key and no order-history/status endpoint. An immediate repeated checkout after a confirmed cart clear sees an empty cart, but this is not a general replay guarantee. After an ambiguous `503` or lost response, the client cannot look up an order to reconcile it safely. The frontend therefore does not present a checkout action or claim an order was placed.
- The order model has no shipping/address or payment fields. No payment is collected. The product/order schemas do not define a currency, so a frontend must not add a currency symbol or claim a payment amount.
- This is source inspection only. The configured backend destination is MongoDB Atlas, and no local MongoDB listener was available during Stage E preflight. The backend was not started, no Express endpoint was called, and no real checkout or database persistence was verified. Existing checkout route tests use mocked model/session behavior; historical disposable-database test results do not replace a fresh local integration check.

## Stage F verification

- Stage F rechecked the checkout route, auth middleware, cart/product/order schemas, server startup, package scripts, Vite proxy, and existing tests. The route still requires bearer authentication and selects the cart by the authenticated user ID. It takes no checkout request fields, computes totals from database product prices, conditionally decrements available stock, writes order snapshots, and clears that cart inside `session.withTransaction()`. It responds with `201` and `{ status: 'success', order }`; empty/unavailable carts can return `409`, and other transaction/confirmation errors return an ambiguous `503`. No order lookup or persistent idempotency mechanism exists. These are source findings, not live transaction results.
- The startup script loads the root `.env` and calls `mongoose.connect()` before opening Express. At Stage F preflight, the effective destination was an Atlas host; no local MongoDB listener was present, and Docker could not connect to a running engine. The backend was not started, the Atlas endpoint was not contacted, and no database writes or integration scripts ran. No isolated local MongoDB setup is claimed.
- Offline verification passed: client `npm.cmd test` (37 tests), client `npm.cmd run build`, client and server `npm.cmd ls --depth=0`, and server `npm.cmd test` (44 tests). The backend checkout route tests mock Mongoose models and sessions; they validate route logic but do not prove MongoDB transaction rollback, concurrency, or persistence. No real database-backed order test ran in Stage F.
- Browser inspection used an isolated temporary Chrome profile at CSS viewports 390×844, 768×1024, and 1440×1000. The catalogue, invalid product detail, login, registration, guest cart, `/checkout`, and not-found routes were visited. The document scroll width matched its client width and no uncaught runtime exceptions were observed. Catalogue and product detail showed the expected unavailable-service state because Express was not running; Chrome recorded those API `502` responses. `/checkout` currently renders the not-found page. No authenticated populated cart or successful order confirmation was tested. Screenshots were saved outside the repository under `%TEMP%\urbankart-stage-f`.
- Browser keyboard testing confirmed the first Tab focuses the visible skip link, and emulated `prefers-reduced-motion: reduce` matched the media query with transitions reduced to `0.00001s` and smooth scrolling disabled. This is a focused check, not a complete accessibility audit. Checkout submission remains unavailable in the client. Before enabling it, use a verified isolated local disposable replica set and add backend-owned idempotency/reconciliation: accept a client-generated request key scoped to the authenticated user, persist it with a unique user/key constraint and the resulting order in the same transaction, return the same order for retries with that key, reject key reuse with a different cart/payload, and provide an authenticated way to retrieve the outcome after a lost response. Verify duplicate/concurrent requests, transaction retries, rollback, and ownership against the isolated database. Do not automatically retry an ambiguous checkout without such a contract.

## Shared architecture and session behavior

- `src/api/httpClient.js` owns the shared Axios instance, base URL, timeout, bearer-token request interceptor, API error normalization, and protected-session invalidation handling.
- `src/api/tokenStore.js` keeps access tokens in memory only. A page refresh loses the token and starts signed out. The backend has no current-user/profile or refresh-token endpoint, so the client does not restore a session.
- `src/api/productApi.js`, `src/api/authApi.js`, and `src/api/cartApi.js` contain endpoint calls. React pages use the existing API client and shared contexts rather than creating parallel state stores.
- `src/auth/AuthContext.jsx` exposes login, registration, local logout, auth status, errors, and session invalidation through `useAuth()`.
- `src/cart/CartContext.jsx` loads the authenticated user's cart and exposes state, derived item count and display subtotal, refresh, and guarded cart mutations through `useCart()`. It hides user-specific cart state after logout/session invalidation and ignores stale responses.
- The server remains authoritative for authentication and stock validation. The UI does not make role-based access decisions. A cart mutation error is shown to the user; the client does not claim an item was added unless its mutation and refresh succeeded.
- A network failure, server error, or failed read-back after a cart mutation can leave its outcome uncertain. The client asks the shopper to refresh and inspect the cart before trying another write; it does not automatically replay the mutation and blocks further cart writes until a read refresh succeeds. A malformed cart response is surfaced as an error instead of being displayed as an empty cart.

## Stage D verification and boundaries

- The API paths and payloads above were checked against the current Express route and Mongoose model source. The backend listens on `PORT` (default `5000`) and its startup script loads the repository-root `.env`, then connects to the configured MongoDB URI before listening. Cart records are stored in MongoDB as `Cart` documents, so they persist across requests and server restarts when the configured database is available.
- The Vite development proxy forwards `/api` to `http://localhost:5000`. A temporary in-memory HTTP fixture confirmed that the proxy forwards a JSON request and bearer header and preserves a fixture `422` JSON response. This is proxy verification only, not an Express/backend integration test. The proxy is development-only; the Express application has no CORS middleware or verified production same-origin routing configuration.
- The local database configuration points to MongoDB Atlas. Atlas use is outside this milestone's safety boundary, so the backend was not started and the Vite proxy was not verified against Express in Stage E. Client behavior is covered by deterministic API-boundary mocks; no live backend response, registration/login write, cart write, checkout, or database persistence was verified in this milestone.
- Client tests do not call checkout. Checkout was not implemented, invoked, or tested in Stage E. Backend source and mock route tests are not proof of live transaction behavior, persistent idempotency, inventory reservation under production load, payment, or delivery.
- Authentication remains memory-only: a refresh signs the shopper out. There is no verified session restoration or refresh-token endpoint. The product API has no image, currency, or category-list field/endpoint, and the server currently returns raw product arrays with pagination headers.
- Before deployment, configure and verify same-origin routing or a deliberate server-side CORS policy, safe environment-specific database configuration, HTTPS, and the backend security/operational controls appropriate to the deployment. This client review is not a full backend security audit.

## Tests and verification

```powershell
npm test
npm run build
npm ls --depth=0
```

Vitest and Testing Library tests mock API modules at the frontend boundary. They cover the Stage B HTTP/auth/cart behavior, Stage C catalogue and route flows, and Stage D malformed-cart and unconfirmed-cart-mutation handling. Tests do not connect to a backend or MongoDB and do not call checkout. A passing client test or build is not a live integration test.

## Stage G local integration verification

Stage G supersedes the earlier no-live-database status above. For this verification only, an already-installed MongoDB Server 8.3 process ran as a single-node replica set on loopback port 27018 with a dedicated disposable data directory and database `urbankart_stageg_local`. The root `.env` was left unchanged; Express and test processes received a process-scoped local `MONGODB_URI`, and no Atlas or production host was contacted. The replica-set primary and a real transaction were verified before application tests. The temporary MongoDB process and data directory were removed afterward.

The existing Express API was exercised with synthetic records: health, product list/search/detail, registration and login, authentication failures, and cart read/add/update/remove/clear. A real Vite development server on port 5182 proxied `/api` to Express on port 5000. Product search returned the synthetic fixture; unauthorized cart access preserved HTTP 401 and its JSON body; an invalid product ID preserved HTTP 400 and its JSON body. With Express stopped, the Vite proxy returned HTTP 502 and the storefront displayed its retryable catalogue-unavailable state. After Express restarted, retry recovered to the expected empty-catalogue state. Port 5181 was already occupied by a pre-existing Node process, so it was left untouched.

An isolated Chrome profile inspected `/`, `/products/:id`, `/login`, `/register`, `/cart`, `/checkout`, and a not-found route at CSS viewports 390×844, 768×1024, and 1440×1000. Search and category filters displayed the live synthetic product. Registration, adding it to an authenticated cart, reading the cart, and increasing quantity were exercised through the UI. All checked routes had no horizontal overflow; no browser runtime exceptions or console errors were observed. The first keyboard Tab reached the visible skip link, and `prefers-reduced-motion: reduce` was honored. Screenshots were written outside the repository to `%TEMP%\urbankart-stageg-screenshots-20261013`.

Real local-replica-set checkout results:

- Rollback: starting stock 5; after a controlled order-write failure, stock remained 5, no failed order persisted, one cart item remained, and the session ended.
- Last-unit race: 20 simultaneous requests produced one HTTP 201 and nineteen HTTP 409 responses; final stock was 0, one order persisted, the successful cart was cleared, and the other 19 carts remained.
- Same-user duplicate requests: two simultaneous requests produced one 201 and one 409; a sequential repeat returned 409 for the empty cart, with no second order. This demonstrates the tested empty-cart behavior, not persistent replay protection.

The backend still has no persistent idempotency key scoped to a customer and no authenticated order lookup/reconciliation endpoint. Transaction-retry edge cases and ambiguous commit outcomes were not injected. A client cannot safely determine whether an order committed after a lost response or ambiguous 503, so checkout remains unavailable in the storefront and uncertain requests must not be automatically retried.

The standard client tests (37) and production build passed; server tests (44) passed. Those offline tests mock API/database behavior and do not establish real MongoDB behavior. The rollback and concurrency results above came from the separate, temporary replica-set database and are bounded to those test scenarios.

## Stage H idempotent checkout and order reconciliation

Stage H supersedes the earlier Stage E/F/G statements that checkout is unavailable and that the API has no idempotency or reconciliation. `/checkout` requires sign-in and shows the API-backed cart plus a non-authoritative subtotal preview. It does not collect payment or shipping details.

`POST /api/cart/checkout` requires `Idempotency-Key` (16–128 ASCII letters, digits, `.`, `_`, `~`, or `-`). The browser creates one secure UUID per attempt, saves it in tab-scoped `sessionStorage` under a user-ID namespace, and reuses it through reconciliation/retry. The server scopes it to the authenticated user and stores a SHA-256 fingerprint of normalized product IDs and quantities with the resulting order. Missing/malformed keys return `400`; authentication is required (`401`); cart/key conflicts return `409`; unconfirmed outcomes return `503`. A unique `{ userId: 1, key: 1 }` MongoDB index enforces key uniqueness. The order, operation, conditional stock decrements, and cart clear commit together in one transaction. Server-side cart ownership, current product prices, and stock are authoritative; no client total or user ID is accepted.

The initial committed request returns `201`; a same-user same-key replay returns `200` with the same order. Reuse with a changed non-empty cart returns `409` without changing stock or cart. After success, an empty cart still reconciles to the existing order. Different users may independently use the same key. A failed transaction commits no operation record, so an uncertain retry reuses the same key safely.

Authenticated `GET /api/cart/checkout/:key` returns `{ status: "success", replayed: true, order }` for a committed operation or a generic `404` when no committed result is visible. A network error or `503` is never displayed as success: the UI checks reconciliation, preserves the key, and allows a same-key retry if no result is visible. If the page is refreshed, memory-only auth signs out; sign in again and the checkout page will reconcile the saved key. The opaque key alone never grants access. Tokens and passwords are not persisted.

Example request:

```http
POST /api/cart/checkout
Idempotency-Key: 5c7bd302-1f3c-4eb4-a131-d2c9bd842672
Content-Type: application/json

{}
```

A confirmed response contains the server order ID, item snapshots, server-computed `totalAmount`, status, and `replayed` boolean. An insufficient-stock/cart conflict is shown as an actionable error; the UI does not construct an order from the cart preview. No payment, delivery, address collection, or currency symbol is implemented.

### Genuine local integration coverage

The tests ran against a fresh disposable MongoDB Server 8.3 single-node replica set bound only to `127.0.0.1:27018`, replica-set name `ukStageH`, database `urbankart_stageh_local`. The local target, exact URI database path, `hello` topology, and writable primary were verified before synthetic fixture writes. The root `.env` values were overridden by process-scoped local settings; Atlas/production were not contacted. Automatic collection/index creation was disabled for integration connections; only after topology validation did the scripts create model indexes. Cleanup used captured synthetic user/cart/product/order/operation IDs.

The idempotency integration passed first checkout `201`, replay `200` with the same order, concurrent same-key requests converging on one order, independent same keys across users, cross-user reconciliation `404`, changed-cart `409` with stock/cart unchanged, a client socket deliberately dropped after sending checkout followed by reconciliation `200`, and rollback after the operation write was reached (zero order/operation, original stock and cart). The existing real rollback test and 20-request last-unit race also passed: one `201`, nineteen `409`, stock 0, one order, winner cart cleared, losing carts retained.
For a manual disposable local setup, start `mongod --dbpath C:\Temp\urbankart-stageh-data --bind_ip 127.0.0.1 --port 27018 --replSet ukStageH` in one terminal. In a second, run `mongosh --host 127.0.0.1 --port 27018 --eval 'rs.initiate({_id:"ukStageH",members:[{_id:0,host:"127.0.0.1:27018"}]})'`, then verify `db.adminCommand({hello:1})` before setting the explicit process-scoped local test variables and running the guarded scripts. Integration preflight allows only `localhost` or literal loopback IPs, requires the URI `replicaSet` value and `URBANKART_TXN_REPLICA_SET_NAME` to agree, and checks the connected `hello.setName`; Atlas/SRV and other remote hosts are rejected before connection. Keep the data directory outside the repository and use a fresh disposable path. These are bounded local scenarios. Dropping the HTTP client connection verifies recovery of a committed order; it does not inject every driver-level unknown-commit-result condition. Ensure the unique compound index exists before deployment when automatic index creation is disabled.

The actual Vite `/api` proxy reached the real loopback Express server and returned the health response. Chrome inspected `/`, a local fixture product detail, login, registration, guest cart, guest checkout, and not-found at 390×844, 768×1024, and 1440×1000. It completed a synthetic customer login and live checkout and displayed the real server order reference. The confirmed-order view was checked at all three sizes; document scroll width matched the viewport's client width, no browser console/runtime errors were observed, Tab focused the skip link, and reduced-motion CSS applied. Screenshots are outside the repository in `%TEMP%\urbankart-stageh-browser-qa-20261013\screenshots`.

The Stage H follow-up fixed the 390px header and captured new homepage screenshots at 390×844, 768×1024, and 1440×1000. The auth actions remained within the viewport, navigation targets measured at least 44px, and no horizontal overflow was detected. A live local UI walkthrough covered API-backed search and category filtering, product detail, registration, login, cart quantity update/removal, and a server-confirmed order using a synthetic local product. Follow-up captures are in `%TEMP%\urbankart-stageh-full-browser-20261013\screenshots`. The strengthened integration preflight now checks loopback hosts, the URI replica-set option, the explicit replica-set name and the connected `hello.setName` before fixture setup.

Offline verification passed: client Vitest 44 tests, server `node:test` 50 tests, production build, dependency listings, 39 JavaScript syntax checks, and `git diff --check`. Frontend mocked tests separately cover authentication gating, one key per attempt, duplicate-click prevention, timeout reconciliation, same-key retry, refresh/re-entry, API-confirmed order details, and definitive stock conflict without false success. They are not MongoDB tests. Remaining limitations include transaction commit uncertainty outside the injected scenarios, ordinary cart mutations racing with checkout (the transaction rechecks its cart fingerprint and safely conflicts), memory-only login sessions, and the absence of payment/shipping/delivery features.
