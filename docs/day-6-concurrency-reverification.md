# Day 6 checkout concurrency and transaction re-verification

All database-writing scenarios ran against the explicitly confirmed local loopback replica set `ukDay6Verification`, database `urbankart_day6_verification`. The preflight checked the exact database name, `replicaSet` URI option, writable primary, and loopback-only advertised member. Scripts clean up only fixture IDs they captured.

## Last-unit race

`node scripts/testCheckoutConcurrency.js --confirm-test-db urbankart_day6_verification` passed. Twenty independent customers each held a cart for the same product with one unit in stock. Results: one HTTP 201, nineteen HTTP 409; final stock zero, exactly one order, successful cart empty, and all 19 losing carts retained. Stock did not go negative.

## Rollback and idempotency

`node scripts/testCheckoutRollback.js --confirm-test-db urbankart_day6_verification` injected an order-write failure after the in-transaction inventory update. The transaction rolled back: stock remained five, no order existed, and the cart item remained; the session ended.

`node scripts/testCheckoutIdempotency.js --confirm-test-db urbankart_day6_verification` passed: initial 201/replay 200 returned the same order; cross-user lookup returned 404; same key was independent per user; changed-cart replay returned 409 without changing stock or cart; insufficient stock returned 409 without an order; lost-response reconciliation returned 200; same-key concurrent requests yielded 200 and 201 with one order; an injected failure left no order or operation and restored stock/cart.

## Boundary

These are real HTTP requests through the application and MongoDB transaction path, but automated integration scripts are not a human-operated browser checkout. The separate startup smoke report records the API/Vite-proxy journey and exact cleanup.
