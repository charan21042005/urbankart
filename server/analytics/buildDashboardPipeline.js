const SALES_STATUSES = Object.freeze(['completed', 'shipped', 'delivered']);

function validItemAmountAndQuantityMatch() {
  return {
    $match: {
      $expr: {
        $and: [
          { $isNumber: '$items.priceAtPurchase' },
          { $gte: ['$items.priceAtPurchase', 0] },
          { $isNumber: '$items.qty' },
          { $gt: ['$items.qty', 0] }
        ]
      }
    }
  };
}

function buildDashboardPipeline() {
  return [{
    $facet: {
      // Which current product categories account for non-cancelled sales?
      // Order items contain historical prices but no category snapshot, so
      // lookup uses the current category and retains deleted products as Unattributed.
      revenueByCategory: [
        { $match: { status: { $in: SALES_STATUSES } } },
        { $unwind: '$items' },
        validItemAmountAndQuantityMatch(),
        {
          $lookup: {
            from: 'products',
            localField: 'items.productId',
            foreignField: '_id',
            as: '_product'
          }
        },
        {
          $set: {
            _category: { $ifNull: [{ $arrayElemAt: ['$_product.category', 0] }, 'Unattributed'] }
          }
        },
        {
          $group: {
            _id: '$_category',
            revenue: {
              $sum: { $round: [{ $multiply: ['$items.priceAtPurchase', '$items.qty'] }, 2] }
            }
          }
        },
        { $project: { _id: 0, category: '$_id', revenue: { $round: ['$revenue', 2] } } },
        { $sort: { revenue: -1, category: 1 } }
      ],

      // Which historical product identities sold the most units? Sort orders
      // first so the displayed name is the most recent recorded name snapshot.
      topProducts: [
        { $match: { status: { $in: SALES_STATUSES } } },
        { $unwind: '$items' },
        validItemAmountAndQuantityMatch(),
        { $sort: { orderDate: 1, _id: 1 } },
        {
          $group: {
            _id: '$items.productId',
            name: { $last: { $ifNull: ['$items.nameAtPurchase', 'Unnamed historical product'] } },
            unitsSold: { $sum: '$items.qty' }
          }
        },
        { $project: { _id: 0, productId: '$_id', name: 1, unitsSold: 1 } },
        { $sort: { unitsSold: -1, productId: 1, name: 1 } },
        { $limit: 5 }
      ],

      // What is the status distribution across ALL orders, including pending
      // and cancelled orders? Keep this branch unfiltered by sales eligibility.
      orderStatusBreakdown: [
        { $group: { _id: { $ifNull: ['$status', 'unknown'] }, count: { $sum: 1 } } },
        { $project: { _id: 0, status: '$_id', count: 1 } },
        { $sort: { count: -1, status: 1 } }
      ]
    }
  }];
}

module.exports = { buildDashboardPipeline, SALES_STATUSES };
