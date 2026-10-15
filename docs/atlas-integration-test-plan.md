# UrbanKart Atlas integration test plan

Status: prepared for review only. The Atlas integration command has **not** been run. No transactional Atlas fixture data has been created by this harness.

## Proposed commands

From the repository root in PowerShell, explicitly select the Atlas profile and run the new isolated entry point:

```powershell
$env:URBANKART_DB_PROFILE = 'atlas-demo'
Set-Location .\server
npm run test:atlas:integration -- --confirm-atlas-demo-db urbankart_atlas_demo --confirm-no-remote-recommendation-scheduler
```

This command uses `%LOCALAPPDATA%\UrbanKart\atlas.env` through the existing profile loader. It does not use any of the existing local-only `test:*:integration` commands. It starts its own ephemeral HTTP listener on loopback for API checks and, for persistence, starts a fresh Node process after the first listener/database connection has been closed.

Before execution, inspect the emitted fixture counts and cleanup reconciliation. The suite is one bounded run: three registered fixture customers, seven marked products (one through admin CRUD), and two concurrent checkout requests. It does not enumerate or modify the imported catalogue.

## Safety gates and database identity evidence

The harness refuses to proceed unless all of these hold:

- `URBANKART_DB_PROFILE=atlas-demo` was explicitly present before the Atlas settings file is loaded, and the loaded profile/environment identify `atlas-demo`.
- The command contains exactly `--confirm-atlas-demo-db urbankart_atlas_demo`; the configured expected name and URI path also resolve exactly to `urbankart_atlas_demo`.
- The configured cluster name is `urbankart-cluster`; the URI is the pinned MongoDB Atlas SRV host whose lowercase hostname SHA-256 matches the local `URBANKART_ATLAS_HOST_SHA256` value.
- TLS is forced on the MongoDB driver with invalid certificates and hostnames disallowed. URI flags that disable TLS validation are refused. A successful authenticated MongoDB connection is required.
- Before connecting or mutating, the harness acquires exclusive local scheduler and API-process leases and confirms the configured foreground API port refuses connections. The API process takes its own lease before connecting and holds it until graceful shutdown; the scheduled recompute and standalone recompute command take the shared scheduler lease. The harness refuses stale or already-held lock files and never removes them automatically.
- `--confirm-no-remote-recommendation-scheduler` is an explicit operator attestation that no separate machine/deployment runs the recommendation scheduler. Local filesystem locks and a loopback port check cannot observe remote workers; do not run unless that condition has been checked.
- Live `hello` topology and server version must match the configured transaction-capable topology attestation.
- `autoIndex` and `autoCreate` are disabled. The harness does not initialize collections or indexes and does not recompute recommendations.
- An active administrator must already exist. A signed in-memory token is used only for read-only admin checks; the harness does not create, modify, or promote an administrator.

The success report prints the verified database name and topology, never the connection URI, host hash, password, password hash, or token.

## Test stages and intended mutations

| Stage | Expected writes | Verification |
| --- | --- | --- |
| Registration and login | Three fresh customer records through `/api/auth/register`; no administrator role accepted | Login with a generated fixture password; customer admin request returns 403 |
| Cart lifecycle | One fixture cart per customer as needed; add, quantity update, remove, and clear its marked product | Verify each API response and final cart state |
| Successful checkout | One marked product stock decrement by 2; one order with immutable name/price/quantity snapshots; one checkout operation; customer cart cleared | Verify price arithmetic, order item snapshots, stock, replay result |
| Conflicting key reuse | Add a second marked product to the same customer cart; no second order/stock change is expected | Reuse successful key with changed cart and expect 409; then clear only that fixture cart |
| Rollback | Transaction attempts stock decrement and injects an order-write failure inside the test process; none of those transaction writes should persist | Expect 503; stock and cart must match their pre-attempt values; no rollback order should remain |
| Bounded concurrency | One marked stock-1 product, two fixture carts, two checkout operations requested concurrently; exactly one order and one stock decrement should commit | Expect one 201 and one 409; final stock zero, never negative |
| Review lifecycle | One marked review is created, updated by its author, rejected for another author, then deleted; product aggregate changes with it | Verify `ratingCount` and `ratingAvg` through each transition |
| Admin authorization, product CRUD, and analytics | One additional product created through the admin API, updated, and deleted; no customer can create it | Anonymous request returns 401; customer requests return 403; existing admin reads overview/users/dashboard and completes marked product CRUD |
| API process restart persistence | No fixture changes | Close the suite listener and DB connection, launch a fresh Node process, reconnect, authenticate `/api/users/me` for the fixture, then reconnect for cleanup |

The three customer records and seven products include the unique run marker. Product marker values are stored in an `integrationMarker` attribute. Checkout keys also begin with a run-specific marker. No test mutates any pre-existing catalogue record. Recommendation count is measured before/after and must stay unchanged.

## Cleanup scope and recovery

The suite records planned user/product markers before sending creation requests, so a lost HTTP response can be recovered after reconnect with an exact generated email + name + role or exact generated product name + category + run marker. More than one exact match is reported and retained; the harness refuses ambiguous cleanup. It also captures IDs immediately after successful responses. Checkout operation IDs are recovered only for fixture user IDs and exact generated idempotency keys; orders are deleted only when linked to those exact operations and captured as that operation's order. Reviews are deleted only by captured ID plus exact fixture author, product, and run-tagged content. If a review recovery query finds more than one match, all are retained for review. Carts are recovered only by the fixture users' IDs and deleted with captured cart ID + owner ID. Products are deleted only by captured ID + generated name/category + marker, and only when unreferenced. Users are deleted only by captured ID + generated email/name + customer role, and only after owned records are absent.

SIGINT/SIGTERM prevents new requests/steps, terminates a running persistence child, and enters scoped cleanup/reconciliation. Requests already in flight are bounded by a 15 second timeout. A forced process termination can still interrupt cleanup; the report includes run ID, created/cleaned/retained IDs, unresolved exact markers, and sanitized cleanup errors. Do not rerun after an incomplete reconciliation until those exact records have been reviewed.

The suite never uses `dropDatabase`, collection drops, broad `deleteMany({})`, or generic collection reset. It checks that captured fixture IDs no longer exist and that the recommendation document count is unchanged. If cleanup or reconciliation fails, it prints the run marker and only captured fixture IDs/counts for manual recovery; it does not broaden cleanup filters. Do not rerun while an earlier run reports incomplete cleanup until those exact records are reviewed.

## Known limits before execution

- This is a test harness, not legal or production certification. Atlas-specific transaction and application behavior remains unverified until the command is explicitly approved and run.
- The persistence check exercises a fresh Node API process/listener and reconnect against the same verified Atlas target; it does not restart the user's foreground API on port 5000.
- Stop the already-running Atlas API for the test window. Confirm there is no remote API/scheduler deployment, then include the explicit remote-scheduler confirmation flag. The local API lease and port probe prevent a local scheduler from restarting during the suite. Restart the foreground API after the harness exits and confirm the lock was released. If a stale lock remains after a crash/forced termination, inspect its PID/process and remove only that specific lock file manually after verifying the process is gone; the harness does not clear it.
- Recommendation validation is limited to proving the existing recommendation document count did not change; the imported recommendation corpus is otherwise left untouched.
- The concurrency assertion covers two simultaneous requests against one stock-1 fixture. It is not equivalent to the prior 20-request stress test and does not establish high-load behavior.
- The client Vitest runner currently stalls before reporting tests; see the active task report for bounded diagnostics and unresolved client test status.
