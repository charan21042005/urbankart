# UrbanKart live demo script (about 4 minutes)

For the expanded 7–10 minute evaluation flow and exact PowerShell setup, use [`final-e2e-demonstration-runbook.md`](final-e2e-demonstration-runbook.md).

## Before the timer

Start the local MongoDB replica set, then start Express in `server/` and Vite in `client/` using the safe local commands in the root README. Use a disposable local database and test accounts only. Have a local admin account available; do not show `.env`, passwords, tokens, or raw database credentials. If MongoDB or authentication is unavailable, show the recorded evidence and explain the blocker instead of improvising against a real account.

## 0:00–0:40 — storefront and data model

Open `http://127.0.0.1:5173/`. Browse a category and explain that category-specific specifications are stored as `{ key, value }` attributes (the Attribute Pattern), so clothing and electronics need not share a rigid set of columns. The locally imported catalogue has 19,159 accepted products, with stock set to zero because the source has no inventory field.

## 0:40–1:30 — customer account and cart

Register or log in with a disposable customer. Add an in-stock synthetic demo product and open the cart. Mention server-side validation of product IDs, integer quantities, and current stock. Do not use a real customer's account or make a real purchase.

## 1:30–2:20 — checkout and snapshots

Complete checkout with the local demo fixture. Explain that MongoDB transactions group the conditional stock decrement, order snapshot, idempotency operation, and cart clearing. The order retains the purchase-time product name and price if the catalogue changes later. The 20-request test raced for one unit and observed one success, 19 conflicts, stock zero, and one order.

## 2:20–3:00 — recommendations

Open a product's recommendations. Explain the implemented method accurately: typed tags and key/value attributes use equal-weight Jaccard similarity, with a 0.2 same-category bonus, capped at 1; the stored explanation lists shared features. A scheduled job materializes up to five results. This is content-based scoring, not a neural network or vector search.

## 3:00–3:35 — admin analytics

Log in as a local admin and open the dashboard. Describe the MongoDB aggregation `$facet`: revenue/category, top products, and order-status results are computed from orders; only the admin role can retrieve the endpoint. Never display test JWTs or account secrets.

## 3:35–4:00 — evidence and limits

Show `docs/day-6-indexing-evidence.md` and the raw explain JSON. The category browse plan used `IXSCAN` after the compound index but still sorted by `_id`; the one-run measured time was 21 ms after versus 13 ms before, so this proves index use, not improvement. Mention the verified backend review CRUD (public reads, signed-in create, author-only edit/delete); the SRS does not require a review form in the storefront. Close with dataset AMBER rights status, Docker/browser screenshot limitations, and unimplemented stretch items.
