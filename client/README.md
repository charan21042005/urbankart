# UrbanKart Client

React 19 and Vite storefront using the existing editorial paper, ink, rust, and olive design system. The client consumes the Express API through one Axios client; it has no fallback/mock catalog in the application build. Tests may mock API modules, but that data is test-only.

## Local setup

Requirements: Node.js 20.19+ (or 22.12+) and npm. Start Express against the database you have deliberately configured, then run:

```powershell
cd client
    npm.cmd install
    npm.cmd run dev -- --host 127.0.0.1
```

Vite normally serves `http://127.0.0.1:5173`. Its `/api` proxy defaults to `http://127.0.0.1:5000`. For a different loopback API port, set the process variable `URBANKART_DEV_API_PROXY=http://127.0.0.1:<port>` before starting Vite. The Vite config rejects non-loopback, non-HTTP, or credential-bearing proxy origins. `VITE_API_BASE_URL` may select a public API base URL, but all `VITE_` values are visible in the browser; never put secrets there.

## Routes and API contracts

- `/` calls `GET /api/products` with backend text search, exact observed category, sort, and page/limit parameters. Pagination metadata uses `X-Total-Count`, `X-Page`, `X-Page-Size`, and `X-Total-Pages`. `GET /api/products/categories` provides real category choices. Loading, empty, error/retry, and pagination states are explicit; stale responses are discarded.
- `/products/:id` calls `GET /api/products/:id` and renders the API's name, description, numeric price, stock, category, and `{ key, value }` attributes. The schema does not supply product images or currency; the local abstract visual is not presented as a product photograph.
- `/register` calls `POST /api/auth/register` with name/email/password; `/login` calls `POST /api/auth/login`. The server issues a customer role and public user payload. Access tokens are memory-only. The shared Axios request interceptor attaches the bearer token; it is not persisted in local or session storage.
- `/cart` uses authenticated `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/:productId`, `DELETE /api/cart/items/:productId`, and `DELETE /api/cart`. The context refreshes server state after each mutation and blocks further edits when a network/server result is uncertain.
- `/checkout` shows a preview from the API-backed cart, not an authoritative charge. It submits `POST /api/cart/checkout` with one user-scoped idempotency key. A confirmed order view is rendered only after the API returns the persisted order; uncertain requests reconcile via `GET /api/cart/checkout/:key` and reuse the same key. No address, shipping, payment, tax, or currency feature is implemented.
- Unknown routes render a useful not-found page.

The global `AuthProvider` owns the in-memory public user, authentication status, and session revision. `CartProvider` owns one user's server-confirmed cart, mutation/loading/error state, and prevents stale user data from crossing sessions. Header, product detail, cart, and checkout consume these contexts.

## Accessibility and responsive behavior

The app uses semantic main/navigation landmarks, a visible-on-focus skip link, associated labels, accessible product names, visible focus styles, keyboard-operable controls, reduced-motion styles, and responsive layouts. Previous Stage H QA inspected the UI at 390×844, 768×1024, and 1440×1000. The latest Days 1–4 run verified the live API/proxy flow but could not capture fresh browser screenshots: the installed Chrome GPU subprocess exited with Windows access denied. Do not treat the current code changes as freshly browser-verified; the completion report records this limit.

## Client checks

```powershell
npm.cmd test
npm.cmd run build
npm.cmd ls --depth=0
npm.cmd ls --package-lock-only --depth=0
```

Vitest/Testing Library tests use mocked API modules for client behavior, including catalog state, auth/cart state, and uncertain checkout reconciliation. They do not establish visual browser or MongoDB behavior. The final 2026-10-14 rerun passed 60 tests across 9 files and the production build. The browser limitation and exact live HTTP coverage are recorded in the [final evaluation runbook](../docs/final-e2e-demonstration-runbook.md).
