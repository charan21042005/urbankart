# Dataset provenance and licence assessment

Assessment date: 2026-10-14 (licence scope recheck; import state updated).

- **Dataset declaration:** `DECLARED_CC_BY_SA_4_0`
- **Overall redistribution clearance:** **AMBER — declared licence, scope/third-party rights not fully verified**
- **Retailer images, trademarks, and description rights:** Unverified separately

This is a project provenance record, not legal advice or a guarantee of non-infringement.

## Official source and declaration

Dataset: [PromptCloudHQ — Flipkart Products](https://www.kaggle.com/datasets/PromptCloudHQ/flipkart-products)

Licence declared on that Kaggle dataset page, as directly observed and reported by the user on 2026-10-13: [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

The declaration status records what the Kaggle dataset page says; it is not independent proof that the uploader owns or has permission to license every item within the dataset. The official Kaggle page and its `/data` and `/code` routes were opened during this review, but the browserless web capture returned no page body for these JavaScript-rendered views. Kaggle search indexed the title/description as “20,000 products on Flipkart”; PromptCloud's Kaggle profile describes the uploader as a business development manager at PromptCloud and lists this as a single-CSV dataset. The dataset page search result identifies “PromptCloud and 1 collaborator.”

No separate uploader attribution text, copyright notice, image licence, retailer permission, or other dataset-specific rights notice could be read from the captured page content. The currently available creator credit for attribution is therefore the Kaggle dataset title and uploader name above, linked to the source and licence. If the source page supplies a more specific requested attribution or copyright notice in its live Data Card, retain it when redistributing the dataset or an adaptation.

## File and metadata inspection

The local ignored file is `server/seed/data/flipkart_com-ecommerce_sample.csv` (38,114,963 bytes when checked on 2026-10-13). The filename matches the single CSV named in the Kaggle dataset listing. Its header row was read without importing or copying the file. Fields are:

`uniq_id`, `crawl_timestamp`, `product_url`, `product_name`, `product_category_tree`, `pid`, `retail_price`, `discounted_price`, `image`, `is_FK_Advantage_product`, `description`, `product_rating`, `overall_rating`, `brand`, `product_specifications`.

The CSV contains product metadata, retailer/product identifiers and URLs, text descriptions, brand names, and an `image` URL field. That field contains links, not proof that the dataset uploader owns the linked image files. Product names, descriptions, brands, trademarks, retailer URLs, and image assets can have rights or terms independent of rights in the compilation/database. No image bytes were downloaded or added to UrbanKart.

## UrbanKart transformations and attribution

The importer (`server/seed/importKaggleProducts.js`) performs these transformations:

- trims/normalizes strings and parses the category tree to retain its top-level category;
- validates positive numeric discounted prices and rejects invalid records;
- rejects repeated source IDs and duplicate normalized product fingerprints;
- parses product specifications into the `{ key, value }` Attribute Pattern and maps brand into an attribute;
- maps selected source IDs to deterministic internal IDs;
- retains available product name, description, category, discounted price, specifications, and brand;
- omits the source image URL, retail price, ratings, product URLs, crawl timestamp, and other fields from the UrbanKart Product record;
- assigns stock `0` only when an operator explicitly chooses that synthetic default, because inventory is absent from the source.

The storefront About & Data Sources notice credits PromptCloud and links both the Kaggle source and CC BY-SA 4.0. It summarizes these transformations and says that retailer descriptions, trademarks, and image links may have separate rights. The CSV remains ignored by Git; no raw CSV or retailer images are included in this repository. On 2026-10-14 a guarded import placed 19,159 normalized product records into the isolated `urbankart_acceptance_20261014` local database; see [`evidence/final-catalog-recovery-2026-10-14.json`](evidence/final-catalog-recovery-2026-10-14.json). This import does not change the separate rights uncertainty or clearance status.

## Licence obligations and scope

CC BY-SA 4.0 permits sharing and adaptation of material to which the licensor has authority to grant rights, subject to attribution and ShareAlike conditions. If UrbanKart shares adapted material, it must identify modifications and provide the source and licence links; ShareAlike requires an eligible CC BY-SA (or compatible) licence for the shared adaptation. The official [CC BY-SA 4.0 legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en) states that the grant is limited to rights the licensor has authority to license, excludes trademark rights from the grant, and provides a specific rule for substantial database extraction: where applicable sui generis database rights cover the use, a database containing all or a substantial portion may itself be Adapted Material, while the individual contents are not made adapted solely by that database rule.

This does **not** establish that all UrbanKart source code, independently created interface artwork, or unrelated project material must automatically be licensed CC BY-SA merely because it is in the same repository or application. Whether particular product records, a normalized catalogue, or a public service constitutes sharing an adaptation or substantial database extraction depends on what is copied, the applicable rights, and the facts. The rights held in descriptions, individual product fields, and retailer imagery remain a separate uncertainty. Do not infer that the uploader's dataset declaration grants Flipkart or other third-party rights.

## Status by intended use

| Material / use | Status and limits |
|---|---|
| Kaggle dataset declaration | `DECLARED_CC_BY_SA_4_0`; this is the uploader/platform label as observed by the user, not verified chain of title. |
| Reuse/redistribution of dataset material that the uploader can license | The declared CC BY-SA 4.0 terms call for attribution, licence link, indication of changes, and ShareAlike for shared adaptations. Assess whether the importer’s subset and transformation is Adapted Material before public redistribution. |
| Substantial portion in a database | CC BY-SA 4.0 Section 4 has a database-specific adaptation rule if applicable sui generis database rights exist. Scope and application to this particular catalogue are not adjudicated here. |
| Product descriptions and other retailer-sourced text | **Unverified**; a dataset-level declaration does not prove the uploader had authority over every record. Keep public redistribution/deployment under review. |
| Trademarks and product/retailer branding | **Not granted by CC BY-SA**; the licence expressly does not license trademark rights. |
| Image URLs and image assets | **Unverified separately**; links do not establish permission to display, hotlink, download, or redistribute image bytes. UrbanKart does not use these URLs and adds no retailer images. |
| Raw CSV in Git | **Not included**; keep ignored until file-level scope, attribution, and ShareAlike obligations are assessed for intended distribution. |
| Project source code and original CSS illustrations | No automatic whole-project CC BY-SA conclusion is made; determine licence scope for specific material if a catalogue adaptation is shared. |
| Local development and educational use | The local copy is subject to applicable licence and third-party rights. This record does not guarantee clearance. |

## Next action

Before publishing the CSV, a substantial catalogue extract, product descriptions, or product images, preserve the source page’s licence/attribution details and determine whether the uploader had authority to license the relevant fields. For images, obtain asset-specific permission or use original/appropriately licensed alternatives. If the intended redistribution cannot meet the applicable attribution and ShareAlike conditions, do not ship that material; continue using the original category-aware illustrations for the storefront. Reassess this record if the live Kaggle Data Card exposes additional attribution or rights notices.
