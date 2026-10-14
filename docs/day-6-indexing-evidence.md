# Day 6 MongoDB index evidence

Date: 2026-10-14. Raw explain output is preserved in [`evidence/day-6/mongodb-index-explains.json`](evidence/day-6/mongodb-index-explains.json). It was collected by `explain('executionStats')` on 19,159 locally imported product documents. The benchmark used a fresh, unindexed local database and copied documents from the verification database; it did not drop an index from the application database. The isolated target was `urbankart_day6_index_benchmark` on loopback replica set `ukDay6Verification`.

## Category browse with price sort

Query: `{ category: 'Clothing' }`, sort `{ price: 1, _id: 1 }`, limit 20. This matches the API's `category` filter and `price-asc` sort contract.

Before adding the declared compound index, the winning plan contained `COLLSCAN` followed by `SORT`: 19,159 documents examined, zero keys, 20 returned, 13 ms observed. After creating `{ category: 1, price: 1 }` (`idx_products_category_price`), the winning plan contained `IXSCAN` and `FETCH`, examining 5,659 keys/documents, returning 20, 21 ms observed. MongoDB still used a blocking `SORT` for `_id` tie ordering because that field is not part of the declared compound index. The index reduces the scan to the category subset but did not improve measured wall time in this single run (21 ms vs 13 ms); do not present this as a measured latency improvement.

## Text search

The actual weighted index `{ name: 'text', description: 'text', tags: 'text' }` (`text_products_name_description_tags`; weights name 10, description 2, tags 4) produced `TEXT_MATCH` / `TEXT_OR` / `IXSCAN` in the winning plan for an actual term selected from a catalogue product name. Execution stats: 6 keys and 6 documents examined, 6 returned, 23 ms. The exact term and complete plan are in the JSON artifact. This demonstrates index selection, not a broad latency benchmark.

## Interpretation and scope

The data size exceeds the SRS's 10,000-product floor, and observed executions were under 150 ms on this local machine. These single-run `executionTimeMillis` readings do not prove an SLO across machines, warm/cold cache states, workload concurrency, or dataset distributions. Category/price and text search plans are real; price range filtering is not an API feature and is not claimed. The benchmark database was disposable and did not survive a mongod restart; the sanitized plan artifact did. No existing index was dropped.
