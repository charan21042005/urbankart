const mongoose = require('mongoose');

const sharedAttributeSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, maxlength: 120 },
  value: { type: String, required: true, trim: true, maxlength: 120 }
}, { _id: false });

const relatedProductSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  score: { type: Number, required: true, min: 0, max: 1 },
  sharedTags: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
  sharedAttributes: { type: [sharedAttributeSchema], default: [] },
  categoryMatch: { type: Boolean, default: false },
  categoryBonus: { type: Number, min: 0, max: 0.2, default: 0 },
  sharedFeatureCount: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
  unionFeatureCount: { type: Number, min: 0, validate: Number.isInteger, default: 0 }
}, { _id: false });

// A separate collection is the materialized cache for this batch-recomputed view.
const recommendationSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  relatedProducts: { type: [relatedProductSchema], default: [] },
  computedAt: { type: Date, required: true }
});

recommendationSchema.index({ productId: 1 }, { unique: true, name: 'uniq_recommendation_source' });
recommendationSchema.path('relatedProducts').validate(
  (products) => products.length <= 5,
  'A recommendation cache may contain at most five products.'
);

module.exports = mongoose.model('Recommendation', recommendationSchema);
