# Dataset provenance and licence assessment

Assessment date: 2026-10-13. Status: **AMBER — redistribution permission unverified**.

## Source and observed contents

The local importer identifies its source as PromptCloudHQ's [Flipkart Products dataset on Kaggle](https://www.kaggle.com/datasets/PromptCloudHQ/flipkart-products). The importer consumes fields including product name, category, discounted price, description, brand, product specifications and source IDs. The source CSV also contains an `image` column, but the importer does not map it into the product model or storefront. No currency or stock is established by the source; the import workflow requires an explicit synthetic stock default.

The official Kaggle dataset page was opened on 2026-10-13. Its accessible page content exposed the title but no license name, grant text, or attribution instructions. No dataset-specific uploader grant was verified. PromptCloud's [2016 announcement about free e-commerce feeds](https://www.promptcloud.com/blog/indian-ecommerce-data-feeds-weekly/) describes feeds for experiments and lists product names, descriptions, prices, and specifications, but it is not a licence for this archived Kaggle CSV, image assets, GitHub redistribution, or public deployment.

## Rights and use distinction

Kaggle's [dataset documentation](https://www.kaggle.com/docs/datasets) says publishers select a dataset license and may specify "Other" terms in the description. The current dataset page did not expose a verifiable selection. Kaggle's [Terms of Use](https://www.kaggle.com/terms) provide rights necessary to operate Kaggle and make public submissions accessible through its service; they also say users must respect third-party content rights. Those platform terms are not evidence that this uploader granted downstream redistribution rights or owns Flipkart product descriptions and imagery.

| Material / use | Finding |
|---|---|
| CSV metadata and derived normalized catalogue | No dataset-specific licence grant was established. Local educational use may still be subject to source and platform terms; public GitHub redistribution is not verified. |
| Product descriptions and retailer data | Third-party authorship/rights and applicable terms were not independently resolved. |
| Product image links or image files | No licence grant for image assets was established. The application does not display or redistribute these images. |
| Local coursework/development | The existing local copy is kept out of Git and may be used only subject to applicable terms; this assessment does not grant permission. |
| Public website deployment or screenshots | No permission is asserted. Do not expose copied descriptions or photos until rights are resolved. |
| Kaggle public visibility/download | Availability on Kaggle alone is not a downstream licence grant. |

No exact dataset licence name or compliance obligations can be reported because none was verifiably published in the official page content inspected. No unofficial mirror or index was treated as authoritative. Kaggle's current terms were accessed on 2026-10-13; the dataset page content was accessed the same date.

## Image and catalogue implementation

The importer does not persist source image URLs. The frontend uses API-provided product names, identifiers, prices, categories and attributes, with original category-aware CSS illustrations as a clearly representative fallback. No photographs, image URLs, or copied assets were added. The raw CSV path remains ignored by Git (`server/seed/data/`).

## Next action

Request a written dataset-specific licence or permission from the uploader/rights holder that explicitly covers CSV metadata, descriptions, embedded or linked image assets, derivative data, attribution requirements, GitHub redistribution and public deployment. Until received and checked, preserve AMBER status, keep the CSV uncommitted, and do not publish its copied content or images. If no grant can be obtained, select a replacement whose authoritative licence matches the desired use and review any third-party-content conditions before migrating data.
