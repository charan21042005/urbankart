# UrbanKart viva preparation

## Explain the project in one minute

UrbanKart is a React/Vite storefront backed by Express, Mongoose, and MongoDB. It demonstrates flexible product documents, secure customer/admin authorization, embedded carts, transactional checkout with purchase-time snapshots, content-based recommendation caches, and aggregation-based admin analytics. The Day 6 evidence confirms the local behavior without contacting Atlas.

## Likely questions and defensible answers

**Why MongoDB and the Attribute Pattern?** Product kinds have different specifications. Keeping `attributes` as `{ key, value }` pairs avoids schema fields for every possible device or clothing property while retaining category-specific data.

**How is checkout safe under a last-item race?** Each transaction conditionally decrements stock only when enough remains, then creates the order/operation and clears that user's cart. The local 20-request race recorded one 201 and nineteen 409 responses, one order, and stock zero. A transaction rollback test verified the original stock/cart after an injected failure.

**Why store order snapshots?** The receipt must reflect the name and price at purchase time, even if the product changes or is removed later.

**How does idempotency work?** A client key is scoped to the user and protected by a unique index. Replaying the same intent returns the original order; reusing the key for changed cart contents conflicts. A lost-response test reconciled the committed order.

**How are recommendations computed?** The scorer normalizes typed tags and key/value attributes, computes Jaccard `shared / (A + B - shared)`, adds 0.2 for a normalized category match, caps at 1, and stores at most five results with explanation evidence. It is an explainable content-based method, not machine learning, embeddings, or Atlas Vector Search.

**Why a materialized recommendation collection?** The scheduled refresh computes the expensive catalogue comparison in batches, and product reads can return cached top results; stale/missing caches use the implemented fallback. On the imported 19,159-item catalogue, the final refresh stored 95,509 related entries.

**What does `$facet` do in admin analytics?** It lets separate dashboard aggregations (for example order statuses, revenue by product category, and top products) share one aggregation input. Access is checked against the current database user role, not just the JWT's old role claim.

**What did the explain plan prove?** Before indexing, category browse used `COLLSCAN` and examined 19,159 docs. After `{category:1,price:1}`, MongoDB used `IXSCAN` and examined the 5,659-category subset. It still performed a sort for `_id`, and the measured one-run time was slower after (21 ms vs 13 ms); I claim index selection and fewer scanned documents, not speedup.

**Is the catalogue cleared for redistribution?** The Kaggle page declares CC BY-SA 4.0, recorded as `DECLARED_CC_BY_SA_4_0`. The source fields, product text, trademarks, and linked images have separate scope/rights questions. Overall redistribution stays AMBER; raw CSV and retailer image files are not included. This project assessment is not legal advice.

**What is not implemented or verified?** Docker deployment is blocked by no Engine/configuration. GUI screenshots were not captured in this run. Change Streams, Atlas Vector Search, and GridFS are not in code. A one-run local explain is not a sustained performance SLO.

## Suggested whiteboard example

For product A features `{wireless, mechanical}` and product B `{wireless, gaming}`, Jaccard is `1/3`. If their normalized categories match, add `0.2`, giving `0.533333` after six-decimal rounding. This is the actual implemented equal-weight feature/category calculation.
