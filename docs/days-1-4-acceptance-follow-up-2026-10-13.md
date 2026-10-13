# Days 1–4 Acceptance Follow-up — 2026-10-13

## Verdict

**PARTIALLY ACCEPTED.** The isolated database suites and the real browser catalogue-to-order journey passed. The UI now explicitly identifies checkout as mock-only. The SRS, six-day roadmap, and Day 1–4 guides were not available to inspect; dataset rights beyond the uploader's declared licence remain uncertain; payment and delivery are not implemented. This report does not claim legal advice or guarantee non-infringement.

This follow-up supersedes earlier browser-blocked acceptance notes for the checks listed here. Days 5–6 were not started.

## Current run evidence

### Isolation and database

- The disposable database was `urbankart_days1_4_acceptance_20261013` on a fresh, single-member MongoDB replica set named `ukDays14Acceptance`, bound to `127.0.0.1:27021`. The expected database was absent before initialization. The URI selected that exact database and named replica set; no Atlas, production, or database named `test` was used.
- `db:init:local -- --confirm-local-db ...` created seven collection validators and 14 declared model indexes. `test:db:validation -- --confirm-local-db ...` rejected an invalid document in each of the seven collections.
- The CSV import dry run read 20,000 rows: 19,159 valid, 841 rejected, 78 invalid prices, 763 duplicate normalized products, 2 repeated product IDs, and 11,249 unmatched specification pairs. It made no database connection or writes.
- On the same isolated replica set, checkout idempotency passed: first checkout 201, same-key replay 200 with the original order, cross-user reconciliation 404, changed intent 409 without cart/stock mutation, insufficient stock 409 without order/cart/stock mutation, lost-response reconciliation 200, concurrent same-key requests 200/201 with one order, and injected post-operation failure 503 with no order or operation and the cart retained.
- Rollback passed with stock unchanged, no order, and the cart retained. Last-unit concurrency passed for 20 attempts: one 201, nineteen 409, final stock zero, one order, and losing carts retained.
- Browser-backed state was separately inspected before cleanup: the synthetic product had stock 3 after buying quantity 2; the order stored the expected product name and unit price 129.50, quantity 2, and total 259.00; the owning cart was empty; one checkout operation existed. Only the captured synthetic product, customer, cart, order, and operation were then deleted by exact IDs/ownership. A post-cleanup query found zero such documents; all seven collections and their validators/indexes remain.

### Live browser and services

- API: `http://127.0.0.1:5087`, `/api/health` returned success. Frontend: `http://127.0.0.1:5187`, returned HTTP 200. MongoDB, API, and Vite were process-local and loopback-only.
- Browser: Google Chrome 154.0.8037.98, started visibly with a separate temporary profile and a local DevTools endpoint. Brave's first attempt did not expose its debugging endpoint; installed Chrome worked after correcting quoting of the temporary profile path. No unrelated browser process was closed.
- Journey: API catalogue loaded the synthetic product; search and category filter selected it; product detail showed live API data; synthetic customer registration and authentication succeeded; quantity 2 was added and persisted in the cart; cart quantity controls changed 2→3→2; the order was placed; confirmation matched the persisted snapshot; cart cleared and stock decremented by two.
- Negative checks: anonymous checkout returned 401; malformed registration returned 400; authenticated attempt to set quantity above available stock returned 409 and did not alter the cart. The injected transaction-failure/rollback behavior is supported by the current isolated checkout suite above.
- Responsive browser checks used 390×844, 768×1024, and 1440×1000. Measured document width equalled viewport width at all three sizes. Keyboard Tab reached the visible skip link; focus styling was visible. Search/category/sort labels were associated with their controls. The empty-catalogue message appeared after the captured fixtures were cleaned. The application includes loading and error feedback; a browser-rendered API-outage state was not forced.
- The checkout text now reads “Mock checkout only: this records an order without processing payment or delivery.” Confirmation states the same limitation. No payment is simulated or processed, and no shipping details are collected.

Screenshots are outside the repository at `C:\Users\Tokachichu SriCharan\AppData\Local\Temp`:

| File | Viewport / route | Evidence |
|---|---|---|
| `urbankart_acceptance_catalog-390x844.png` | 390×844, `/` | Storefront layout and search/filter controls |
| `urbankart_acceptance_catalog-filtered-390x844.png` | 390×844, `/?search=Acceptance+Studio&category=Home+%26+Lighting` | Filtered API-backed synthetic product |
| `urbankart_acceptance-product-768x1024.png` | 768×1024, `/products/:id` | Product details, category illustration, stock, quantity control |
| `urbankart_acceptance_cart-1440x1000.png` | 1440×1000, `/cart` | Persisted cart and quantity 2 |
| `urbankart_acceptance_checkout-1440x1000.png` | 1440×1000, `/checkout` | Review and mock-only checkout disclosure |
| `urbankart_acceptance_order-confirmed-1440x1000.png` | 1440×1000, `/checkout` success state | Persisted order confirmation and no-payment disclosure |
| `urbankart_acceptance-about-sources-390x844.png` | 390×844, `/` footer disclosure expanded | Dataset attribution and source/licence links |

### Quality commands

- `npm.cmd test` in `server/`: 65 passed, 0 failed.
- `npm.cmd test` in `client/`: 48 passed, 0 failed after the mock-checkout copy adjustment; the checkout tests assert the copy.
- `npm.cmd run build` in `client/`: passed after the UI edit, 173 modules transformed.
- `npm.cmd run import:products -- --dry-run`: passed with the row counts above.
- `npm.cmd ls --depth=0` and `npm.cmd ls --package-lock-only --depth=0` passed in both `server/` and `client/`.
- `node --check` passed across 44 JavaScript files; JSX was parsed by the client tests/build.
- `git diff --check` passed on the final documentation and implementation diff.

## Requirements traceability

| Source | Requirement | Implementation | Evidence | Status |
|---|---|---|---|---|
| Supplied gate §2; readable Day 3 report | Validators and required indexes | `server/db/collectionValidators.js`, model indexes, `server/scripts/initLocalDatabase.js` | Seven validators initialized and exercised; 14 model indexes; schema tests | VERIFIED |
| Supplied gate §2; Day 2 guide not found | Import validation, duplicates, dry run | `server/seed/importKaggleProducts.js`, specification parser | Fresh 20,000-row no-write dry run; importer tests | VERIFIED |
| Supplied gate §2; Day 2 guide not found | Authentication, role checks, cart ownership | `server/routes/authRoutes.js`, `middleware/auth.js`, `routes/cartRoutes.js`; client auth/cart contexts | Current server tests (65/65); browser registration, login and owned cart; anonymous checkout 401 | VERIFIED |
| Supplied gate §2; readable Day 3 report | Atomic stock decrement, snapshots, rollback and concurrency | `server/routes/cartRoutes.js`, `Order.js`, checkout integration scripts | Fresh isolated transaction checks; browser persisted order snapshot, cart clear and stock decrement | VERIFIED |
| Supplied gate §2 | Idempotent replay, key conflict, lost response, cross-user protection | `server/models/CheckoutOperation.js`, checkout routes and client reconciliation | Fresh replica-set suite covers replay, 409 intent conflict, 404 cross-user denial, response reconciliation and concurrent same-key request | VERIFIED |
| Supplied gate §3–4; Day 4 guide not found | Live catalogue, search/filter, details, auth, cart, mock checkout | `client/src/pages/`, API modules, checkout page | Chrome journey and viewport screenshots; negative HTTP cases; persisted DB confirmation | VERIFIED for mock order flow; no payment integration |
| Supplied gate §3 | Responsive layout, keyboard/focus, labels and states | `client/src/styles/`, `App.jsx`, page components | Three viewport measurements; Tab focus; labels; empty state. No forced live outage rendering | PARTIAL |
| User's dataset instruction; supplied gate §5 | Attribution, declared licence, transformations, ShareAlike scope, third-party rights | `docs/dataset-provenance.md`, storefront About & Data Sources | Dated attribution; CSV/header and importer review; source link, licence link, field distinction; third-party grant scope remains unverified | PARTIAL; overall redistribution AMBER |

## Source documents and licence record

The requested SRS, six-day roadmap, and Days 1–4 guide files were searched for in the repository and likely OneDrive project-document locations and were not found. Do not infer their section numbers or requirements. The only matching DOCX is `_day-notes/day-03/UrbanKart_Day3_Implementation_Report.docx`; it was read without changing the source using Python standard-library `zipfile` and `xml.etree.ElementTree` over `word/document.xml`, extracting paragraphs and table text. It supports the Day 3 implementation summary but cannot stand in for the missing SRS/roadmap/guides.

The local ignored CSV `server/seed/data/flipkart_com-ecommerce_sample.csv` and its metadata/header were inspected; its header includes product names, category tree, identifiers, retail and discounted prices, descriptions, brands, specifications, and an image URL field. The importer retains selected catalogue fields, normalizes/rejects rows, converts specifications and brands to attributes, and omits image URLs and other unselected fields. No raw CSV or retailer image bytes were committed or added to the storefront. No independently verifiable uploader-specific attribution or separate asset-rights notice was available in the captured Kaggle page content.

The Kaggle dataset page was opened on 2026-10-13, but the available page capture exposed no body text. The user supplied direct visual evidence that the page declares CC BY-SA 4.0. Record the dataset declaration as **`DECLARED_CC_BY_SA_4_0`**, retaining [the Kaggle source](https://www.kaggle.com/datasets/PromptCloudHQ/flipkart-products) and [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) links. CC's deed describes attribution and ShareAlike conditions and cautions that additional rights can affect intended use; this does not verify the uploader's authority over product descriptions, retailer marks, or image assets. Assess obligations for the specific adapted catalogue or a substantial database extraction; do not infer that all UrbanKart code, original artwork, or unrelated project material must automatically be CC BY-SA. Overall redistribution clearance remains **AMBER — declared licence, scope/third-party rights not fully verified**.

## Remaining limitations

- Missing SRS, roadmap, and Days 1–4 guide source files limit source-based traceability.
- Uploader authority and third-party rights in descriptions, trademarks, and linked images are not established. Keep redistribution clearance AMBER; prefer original or individually licensed imagery.
- Payment, tax, address, shipping, and currency workflows are not implemented. The tested checkout records a mock order only.
- This provenance review is not legal advice and is not a guarantee of non-infringement.
