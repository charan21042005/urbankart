const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const csv = require('csv-parser');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { parseProductSpecifications } = require('./parseProductSpecifications');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const CSV_PATH = path.join(__dirname, 'data', 'flipkart_com-ecommerce_sample.csv');
const REQUIRED_HEADERS = ['uniq_id', 'product_name', 'product_category_tree', 'discounted_price'];
const BATCH_SIZE = 500;
const MAX_STOCK = 2_147_483_647;

function parseArguments(args) {
  const options = { import: false, stockDefault: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--import') {
      options.import = true;
    } else if (args[index] === '--dry-run') {
      options.import = false;
    } else if (args[index] === '--stock-default') {
      const value = args[index + 1];
      if (value === undefined || !/^\d+$/.test(value)) {
        throw new Error('--stock-default must be followed by a non-negative integer.');
      }
      options.stockDefault = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  if (options.import && options.stockDefault === null) {
    throw new Error('Import mode requires --stock-default <integer>; the CSV has no inventory data.');
  }
  if (options.stockDefault !== null && (!Number.isSafeInteger(options.stockDefault) || options.stockDefault > MAX_STOCK)) {
    throw new Error('--stock-default must fit a non-negative BSON int32.');
  }
  return options;
}

function parsePrice(value) {
  if (typeof value !== 'string' || !/^\s*\d+(?:\.\d+)?\s*$/.test(value)) return null;
  const price = Number(value.trim());
  return Number.isFinite(price) && price > 0 ? price : null;
}

function deterministicProductId(sourceId) {
  // A namespaced SHA-256 digest gives the existing ObjectId field a repeatable
  // source identity without adding a field to the approved Product schema.
  const hex = crypto.createHash('sha256')
    .update(`urbankart:PromptCloudHQ:flipkart-products:${sourceId}`)
    .digest('hex')
    .slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

function normalizeRow(row, stockDefault) {
  // Normalize source strings and check required fields here because public CSV
  // catalogs contain inconsistent spacing, absent columns, and malformed values.
  const sourceId = typeof row.uniq_id === 'string' ? row.uniq_id.trim() : '';
  const name = typeof row.product_name === 'string' ? row.product_name.trim() : '';
  const description = typeof row.description === 'string' ? row.description.trim() : '';
  const price = parsePrice(row.discounted_price);

  if (!sourceId) return { error: 'missingSourceId' };
  if (!name) return { error: 'missingName' };
  if (price === null) return { error: 'invalidPrice' };

  let categoryTree;
  try {
    categoryTree = JSON.parse(row.product_category_tree);
  } catch {
    return { error: 'malformedCategory' };
  }
  if (!Array.isArray(categoryTree) || typeof categoryTree[0] !== 'string') {
    return { error: 'malformedCategory' };
  }
  const category = categoryTree[0].split('>>').map((part) => part.trim()).find(Boolean);
  if (!category) return { error: 'missingCategory' };

  const parsedSpecs = parseProductSpecifications(row.product_specifications);
  // Heterogeneous specifications and brand stay in the approved { key, value }
  // Attribute Pattern; no Product schema fields are invented for categories.
  const attributes = parsedSpecs.attributes;
  const brand = typeof row.brand === 'string' ? row.brand.trim() : '';
  if (brand) attributes.push({ key: 'brand', value: brand });

  const product = {
    _id: deterministicProductId(sourceId),
    name,
    price,
    stock: stockDefault,
    category,
    attributes
  };
  if (description) product.description = description;

  return {
    product,
    sourceId,
    malformedSpecifications: parsedSpecs.malformed,
    unmatchedSpecificationPairs: parsedSpecs.missingKeyValue || 0
  };
}

function productFingerprint(product) {
  const attributes = [...product.attributes]
    .map(({ key, value }) => ({ key: key.toLowerCase(), value: value.toLowerCase() }))
    .sort((left, right) => left.key.localeCompare(right.key) || left.value.localeCompare(right.value));
  return JSON.stringify({
    name: product.name.toLowerCase(),
    category: product.category.toLowerCase(),
    price: product.price,
    attributes
  });
}

function upsertOperation(product) {
  const expectedFields = {
    name: product.name,
    price: product.price,
    stock: product.stock,
    category: product.category,
    attributes: product.attributes
  };
  if (product.description !== undefined) expectedFields.description = product.description;

  // Matching the full imported shape makes a rare ObjectId collision fail with
  // a duplicate-key error instead of overwriting an unrelated Day 1 product.
  return {
    updateOne: {
      filter: { _id: product._id, ...expectedFields },
      update: { $setOnInsert: { _id: product._id, ...expectedFields } },
      upsert: true
    }
  };
}

function createSummary() {
  return {
    totalCsvRows: 0,
    malformedCsvRows: 0,
    validRows: 0,
    rejectedRows: 0,
    invalidPrices: 0,
    missingRequiredFields: 0,
    malformedCategories: 0,
    malformedSpecifications: 0,
    unmatchedSpecificationPairs: 0,
    duplicateSourceIds: 0,
    duplicateProductIds: 0,
    duplicateProducts: 0,
    missingBrands: 0,
    skippedProductValidation: 0,
    newlyImported: 0,
    alreadyPresent: 0,
    failedWrites: 0
  };
}

async function runImport({ importToDatabase = false, stockDefault = 0, csvPath = CSV_PATH } = {}) {
  if (!fs.existsSync(csvPath)) throw new Error(`Dataset file not found: ${csvPath}`);
  const summary = createSummary();
  const seenSourceIds = new Set();
  const seenProductIds = new Set();
  const seenProducts = new Set();
  let headers;
  let batch = [];
  let parser;

  async function flushBatch() {
    if (!importToDatabase || batch.length === 0) {
      batch = [];
      return;
    }
    try {
      // Unordered bulk writes let valid rows proceed when an individual upsert
      // fails; per-row errors are counted and reported for later review.
      const result = await Product.bulkWrite(batch, { ordered: false });
      summary.newlyImported += result.upsertedCount || 0;
      summary.alreadyPresent += result.matchedCount || 0;
    } catch (error) {
      const writeErrors = error.writeErrors || error.result?.getWriteErrors?.() || [];
      summary.failedWrites += writeErrors.length || batch.length;
      summary.newlyImported += error.result?.upsertedCount || 0;
      summary.alreadyPresent += error.result?.matchedCount || 0;
      if (!writeErrors.length && !error.result) throw error;
    } finally {
      batch = [];
    }
  }

  try {
    if (importToDatabase) {
      if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for import mode.');
      await mongoose.connect(process.env.MONGODB_URI);
    }

    parser = fs.createReadStream(csvPath).pipe(csv({ strict: true }));
    parser.on('headers', (value) => { headers = value; });
    parser.on('data-invalid', () => { summary.malformedCsvRows += 1; });

    // Async iteration preserves stream backpressure instead of loading a large
    // catalog CSV into memory before validation begins.
    for await (const row of parser) {
      if (!headers || REQUIRED_HEADERS.some((header) => !headers.includes(header))) {
        throw new Error(`CSV is missing required headers. Required: ${REQUIRED_HEADERS.join(', ')}`);
      }
      summary.totalCsvRows += 1;

      const productId = typeof row.pid === 'string' ? row.pid.trim() : '';
      if (productId) {
        if (seenProductIds.has(productId)) summary.duplicateProductIds += 1;
        else seenProductIds.add(productId);
      }
      if (!row.brand || !row.brand.trim()) summary.missingBrands += 1;

      const sourceId = typeof row.uniq_id === 'string' ? row.uniq_id.trim() : '';
      if (sourceId) {
        if (seenSourceIds.has(sourceId)) {
          summary.duplicateSourceIds += 1;
          summary.rejectedRows += 1;
          continue;
        }
        seenSourceIds.add(sourceId);
      }

      const normalized = normalizeRow(row, stockDefault);
      if (normalized.error) {
        // Skip unusable rows with a reason rather than creating partial products
        // that would fail Mongoose or MongoDB's existing schema validation.
        summary.rejectedRows += 1;
        if (normalized.error === 'invalidPrice') summary.invalidPrices += 1;
        if (['missingSourceId', 'missingName', 'missingCategory'].includes(normalized.error)) {
          summary.missingRequiredFields += 1;
        }
        if (normalized.error === 'malformedCategory') summary.malformedCategories += 1;
        continue;
      }

      const fingerprint = productFingerprint(normalized.product);
      if (seenProducts.has(fingerprint)) {
        summary.duplicateProducts += 1;
        summary.rejectedRows += 1;
        continue;
      }
      seenProducts.add(fingerprint);

      if (normalized.malformedSpecifications) summary.malformedSpecifications += 1;
      summary.unmatchedSpecificationPairs += normalized.unmatchedSpecificationPairs;
      try {
        await new Product(normalized.product).validate();
      } catch {
        summary.skippedProductValidation += 1;
        summary.rejectedRows += 1;
        continue;
      }

      summary.validRows += 1;
      if (importToDatabase) {
        batch.push(upsertOperation(normalized.product));
        if (batch.length >= BATCH_SIZE) await flushBatch();
      }
    }

    if (!headers || REQUIRED_HEADERS.some((header) => !headers.includes(header))) {
      throw new Error(`CSV is missing required headers. Required: ${REQUIRED_HEADERS.join(', ')}`);
    }
    summary.totalCsvRows += summary.malformedCsvRows;
    await flushBatch();
    return summary;
  } finally {
    if (parser && !parser.destroyed) parser.destroy();
    if (importToDatabase && mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const summary = await runImport({
    importToDatabase: options.import,
    stockDefault: options.stockDefault === null ? 0 : options.stockDefault
  });
  console.log(`Mode: ${options.import ? 'database import' : 'dry-run only'}`);
  console.log(`Inventory: ${options.import ? options.stockDefault : 0} (synthetic; the source has no stock field)`);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failedWrites > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Product import stopped: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  CSV_PATH,
  parseArguments,
  parsePrice,
  deterministicProductId,
  normalizeRow,
  productFingerprint,
  upsertOperation,
  runImport
};
