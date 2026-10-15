# MongoDB Atlas demo profile (Windows PowerShell)

This is a separate academic demo environment. The local replica set and its data remain available as the fallback. Atlas writes are limited by the scripts to `urbankart_atlas_demo`; the existing `test` and `urbankart_day3_verify` databases are out of scope. Do not commit the ignored credentials file.

## Configure credentials

1. In Atlas, open **Database > Clusters > Connect > Drivers**, select Node.js, and copy the driver URI for the existing `urbankart-cluster`. Do not paste it into chat or documentation.
2. Check **Database Access** for a database user with the minimum project permissions needed to create collections/indexes and perform demo CRUD in the target database. Check **Network Access** and allow the current workstation IP. Never broaden access to `0.0.0.0/0` for convenience.
3. Store the secrets outside OneDrive in `%LOCALAPPDATA%\UrbanKart\atlas.env`. Create the directory and copy the example without putting real credentials in the repository:

```powershell
$atlasDirectory = Join-Path $env:LOCALAPPDATA 'UrbanKart'
New-Item -ItemType Directory -Path $atlasDirectory -Force | Out-Null
Copy-Item .\server\.env.atlas.local.example (Join-Path $atlasDirectory 'atlas.env')
```

Fill the URI locally. Set the path database to `urbankart_atlas_demo`; retain Atlas-provided authentication options. The URI host pin in `URBANKART_ATLAS_HOST_SHA256` must be generated from the lowercased SRV hostname, not copied from the template. Set topology only after checking live `hello`/cluster topology. Generate an independent long random `JWT_SECRET` locally. The config must identify cluster `urbankart-cluster`, profile/environment `atlas-demo`, expected DB `urbankart_atlas_demo`, and topology `replicaSet` or `sharded`. The loader reads this LocalAppData path by default; `URBANKART_ATLAS_ENV_FILE` can point to a different local secrets file.

Example local-only generation after editing the URI (does not display the hostname or hash):

```powershell
$env:ATLAS_CONFIG_PATH = (Join-Path $env:LOCALAPPDATA 'UrbanKart\atlas.env')
$env:ATLAS_HOST_HASH = node -e "const fs=require('fs'),c=require('crypto'),d=require('dotenv');const e=d.parse(fs.readFileSync(process.env.ATLAS_CONFIG_PATH));const h=new URL(e.MONGODB_URI).hostname.toLowerCase();process.stdout.write(c.createHash('sha256').update(h).digest('hex'))"
```

Put the resulting hash in the local config as `URBANKART_ATLAS_HOST_SHA256=...`; then clear the temporary variables with `Remove-Item Env:ATLAS_CONFIG_PATH,Env:ATLAS_HOST_HASH`. The app never exposes the URI or host hash through its health endpoint. The project folder may sync through OneDrive, so keep the machine account protected; `.gitignore` only prevents Git staging.

## Audit and initialize

Confirm in Atlas UI that the selected SRV connection belongs to the existing UrbanKart project and `urbankart-cluster`, and that it is the intended demo cluster. MongoDB's `hello` response cannot verify the Atlas UI display name.

```powershell
$env:URBANKART_DB_PROFILE = 'atlas-demo'
cd .\server
npm run audit:database -- --confirm-atlas-read-db urbankart_atlas_demo
```

The audit is read-only. Review the complete output first. If the target has any collections, stop and inspect it; the initializer deliberately refuses a non-empty database.

If the audit reports a server-selection or IP-allowlist error, open Atlas **Security > Network Access > IP Access List > Add IP Address > Add Current IP Address**, save a narrowly scoped entry (and suitable expiration), wait until Atlas reports it active, and rerun the read-only audit. Avoid `0.0.0.0/0`. If the user's public IP changes, repeat this step. Also verify the database user is active and has database permissions; never paste its password or URI into chat.

Only after confirming the target and reviewing the audit:

```powershell
npm run db:init:atlas -- --confirm-atlas-demo-db urbankart_atlas_demo
npm run import:products -- --dry-run --stock-default 10
npm run import:products -- --import --stock-default 10 --confirm-atlas-demo-db urbankart_atlas_demo
npm run recommendations:recompute -- --confirm-atlas-demo-db urbankart_atlas_demo
npm run audit:database -- --confirm-atlas-read-db urbankart_atlas_demo
```

The importer uses the existing source mapping, validation, and deterministic identifiers. A repeated import is designed to be idempotent; it does not delete unrelated records. The dry run reports candidate reconciliation before writes. The local CSV must already be present at `server/seed/data/flipkart_com-ecommerce_sample.csv`; it is ignored by Git. Do not download or commit it as part of this runbook.

## Admin, API, and storefront

Create a fresh demo administrator; no local account or password hash is copied. The password is typed into a hidden terminal prompt.

```powershell
npm run admin:setup:atlas -- --confirm-atlas-demo-db urbankart_atlas_demo
npm start
```

The API startup logs the selected profile, database name, and live topology without credentials. In another PowerShell window, start the Vite client:

```powershell
cd ..\client
npm run dev
```

Use the printed local Vite URL. Demonstrate catalogue search/filter/detail, register a fresh customer, cart and checkout, then sign into the admin account to show products, orders, reviews, users/carts, and analytics. Browser UI verification must be recorded separately from API checks.

## Atlas integration checks and limitations

The existing database integration scripts are local-replica-set checks. Do not run them against Atlas until a dedicated Atlas test harness with scoped record IDs and safe cleanup has been reviewed. The read-only audit, Atlas initialization, product import, recommendation rebuild, and fresh admin setup are Atlas-aware; they do not constitute the complete Atlas end-to-end suite. Never reuse local IDs or run generic cleanup against Atlas.

## Return to local mode

Stop the Atlas API with Ctrl+C. In the API PowerShell window:

```powershell
Remove-Item Env:URBANKART_DB_PROFILE -ErrorAction SilentlyContinue
cd ..\server
npm start
```

The default profile loads the existing root `.env` local settings. For local database tools, use their existing `--confirm-local-db` / `--confirm-test-db` confirmations exactly as documented by the corresponding scripts. No command in this runbook modifies Atlas `test` or `urbankart_day3_verify`.

This runbook documents engineering safeguards, not legal advice or a guarantee of non-infringement.
