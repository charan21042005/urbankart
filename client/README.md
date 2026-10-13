# UrbanKart Client

React storefront for the UrbanKart e-commerce project. Stage A's editorial paper, ink, rust, and olive design system remains the visual foundation. Stage B supplies shared API, authentication, and cart state. Stage C connects catalogue, product detail, login/registration, and cart editing screens to the existing backend. Stage D hardens cart response handling and the UI for cart changes whose outcome cannot be confirmed.

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
- The frontend does not call the backend checkout or order-creation endpoint. Checkout, payment, delivery, inventory reservation, product image delivery, and server-provided currency formatting are outside Stage C.

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
- The local database configuration points to MongoDB Atlas. Stage D therefore did not start the backend or send requests through it: Atlas use is outside this milestone's safety boundary. Client behavior is covered by deterministic API-boundary mocks and browser fixtures only; no live backend response, registration/login write, cart write, or database persistence was verified in Stage D.
- Client tests do not call checkout. Checkout was not implemented, invoked, or tested in Stage D. Do not infer transactional, idempotency, inventory-reservation, payment, delivery, or production-load guarantees from the client checks.
- Authentication remains memory-only: a refresh signs the shopper out. There is no verified session restoration or refresh-token endpoint. The product API has no image, currency, or category-list field/endpoint, and the server currently returns raw product arrays with pagination headers.
- Before deployment, configure and verify same-origin routing or a deliberate server-side CORS policy, safe environment-specific database configuration, HTTPS, and the backend security/operational controls appropriate to the deployment. This client review is not a full backend security audit.

## Tests and verification

```powershell
npm test
npm run build
npm ls --depth=0
```

Vitest and Testing Library tests mock API modules at the frontend boundary. They cover the Stage B HTTP/auth/cart behavior, Stage C catalogue and route flows, and Stage D malformed-cart and unconfirmed-cart-mutation handling. Tests do not connect to a backend or MongoDB and do not call checkout. A passing client test or build is not a live integration test.
