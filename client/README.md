# UrbanKart Client

React frontend for the UrbanKart e-commerce project. The Stage A editorial visual foundation remains in place; Stage B adds reusable authentication and server-backed cart state without adding catalog, cart-editing, or checkout screens.

## Local setup

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```powershell
cd client
npm install
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`. Create a production build with `npm run build`, inspect it using `npm run preview`, and run the frontend tests using `npm test`.

## API configuration

Set the public browser API base URL in `client/.env.local` when the backend is not using the default:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

The default is `http://localhost:5000/api`. The URL already includes `/api`; API modules append paths such as `/auth/login` and `/cart`. Vite-exposed `VITE_` variables are public. Never put passwords, JWT secrets, database URIs, or other private values in them.

## Stage B architecture

- `src/api/httpClient.js` owns the shared Axios instance, timeout, bearer-token request interceptor, API error normalization, and authenticated-session invalidation handling.
- `src/api/tokenStore.js` abstracts access-token storage. The current policy is memory-only: the token is lost on page refresh, so a refresh starts signed out. This avoids persistent browser storage but does not protect a running page from JavaScript injected by an XSS vulnerability.
- `src/api/sessionEvents.js` relays invalid-session events without coupling Axios to React.
- `src/api/authApi.js` calls the existing `POST /api/auth/register` and `POST /api/auth/login` endpoints. Public registration sends only name, email, and password; the server assigns the customer role.
- `src/api/cartApi.js` reads `GET /api/cart` and normalizes the populated product reference.
- `src/auth/AuthContext.jsx` exposes login, registration, local logout, auth status, errors, and session invalidation through `useAuth()`.
- `src/cart/CartContext.jsx` loads the authenticated user's server cart and exposes loading/empty/error status, item count, display total, and refresh through `useCart()`. It clears or hides state on logout/session changes and ignores stale responses.
- Provider order in `src/main.jsx` is `AuthProvider` → `CartProvider` → `BrowserRouter`, so cart state can depend on authentication state.

The backend does not provide a current-user/profile endpoint, refresh-token flow, or HttpOnly-cookie authentication. The client therefore does not restore or validate a token across refreshes. The API's bearer-token response is kept only in memory. Local logout clears the token and user state without making a network request. A protected-request `401` invalidates only the session revision that made that request; login/registration `401` responses remain form-level errors. Requests are not automatically retried.

The client displays no role-based authorization decisions; server-side authorization remains authoritative. Cart contents and product prices come from `GET /api/cart`; no browser storage is treated as a cart database.

## Tests and current scope

`npm test` runs the isolated Vitest/Testing Library suite in `src/test/`. HTTP tests use an in-process Axios adapter and context tests mock API modules. They do not contact the backend or MongoDB. The suite covers API URL/token headers, error mapping, login versus protected `401` behavior, auth lifecycle, registration and logout, cart loading/derived totals/error/empty states, stale-response handling, provider-hook boundaries, and existing route mounting.

The current landing preview and not-found route remain. Product catalog/search/details, authentication forms/pages, cart editing UI, checkout, and order confirmation are not implemented in this stage. No real product data is embedded in the frontend.
