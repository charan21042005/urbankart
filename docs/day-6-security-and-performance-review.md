# Day 6 security and performance review

Date: 2026-10-14. This is an engineering verification record, not legal advice.

## Confirmed controls

- The root `.env` is ignored and was not read or printed. Tracked environment files are examples only. Day 6 process-scoped values pointed to loopback MongoDB; a generated temporary JWT key was used for smoke checks and was not recorded.
- Database writes are gated by exact confirmation name, explicit isolated-development assertion, local replica-set URI/member checks, and writable-primary identity. Integration fixtures capture IDs and clean up only those IDs.
- Authentication stores bcrypt hashes; registration ignores a client-supplied admin role. Current database role checks gate admin routes. Automated smoke observed a customer receive 403 from the admin dashboard and an admin receive 200.
- Checkout validates idempotency keys and transactionally changes stock/order/operation/cart. Race, rollback, same-key, changed-intent, and reconciliation checks passed.
- Raw CSV is ignored/untracked. No retailer images were downloaded. The importer omits the source image URL and generated stock is zero.

## Correctness defect fixed

Full-catalog recommendation recompute originally failed with MongoDB error 121 because imported long attribute strings made persisted explanation items violate the existing 120-character validator. Stored explanation text is now clipped to the validator limit, and tag explanations are bounded to 50; the score and feature counts continue to use all normalized features. Focused regression and full recompute passed. This is a persistence-boundary correctness fix, not an algorithm or product-scope change.

## Performance evidence and advisory items

- Dataset: 19,159 products. Category browse after the actual compound index examined 5,659 docs/keys versus 19,159 docs/zero keys before. One run was 21 ms after versus 13 ms before; the result is not evidence of a latency improvement. The API's `_id` tiebreaker still required a blocking sort.
- Text index plan used `TEXT_MATCH`/`TEXT_OR`/`IXSCAN`, 6 docs/keys examined, 6 returned, 23 ms. These are local single-run explain timings only.
- Production JS bundle is 749.15 kB minified, 224.17 kB gzip; Vite warns above 500 kB. No unrelated code-splitting refactor was made.
- Docker Engine and Compose configuration are unavailable; browser GUI screenshots were not captured. Neither is disguised as a pass.

## Dataset and third-party rights

The Kaggle dataset page declares CC BY-SA 4.0 (`DECLARED_CC_BY_SA_4_0`). Uploader authority and exact scope for tabular material were not independently established from all dataset files/notices. Retailer product descriptions, marks, and linked or embedded images are assessed separately and remain unverified. ShareAlike could apply to adaptations or a substantial database portion depending on scope and intended distribution; this report does not conclude that all UrbanKart code/UI must be CC BY-SA. Overall redistribution remains **AMBER — declared licence, scope/third-party rights not fully verified**. See [`dataset-provenance.md`](dataset-provenance.md); attribution is also in the storefront footer.

## Repository hygiene

Starting history was clean at `0dcadc49bd2a5763503dd522fdf19a73417b50e2`, `main` equal to `origin/main`, and no tags existed. No dataset, database files, secrets, or environment files are intended for staging. A final `git status`, tracked-file scan, and staged-diff review are required before committing. Do not rewrite older commit history.
