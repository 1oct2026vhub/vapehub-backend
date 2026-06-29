const cron = require('node-cron');
const { Op, col, QueryTypes } = require('sequelize');
const { ProductVariant, Product, sequelize } = require('../models');
const sendEmail = require('../library/sendEmail');
const constants = require('../config/constants');
const moment = require('moment-timezone');

const SUCCESSFUL_ORDER_STATUSES = ['completed', 'delivered', 'shipped'];

async function fetchLowStockVariants() {
  return ProductVariant.findAll({
    where: {
      is_discontinued: false,
      stock: { [Op.gte]: 0 },
      [Op.and]: sequelize.where(
        col('ProductVariant.stock'),
        Op.lte,
        col('ProductVariant.low_stock_threshold')
      ),
    },
    include: [{
      model: Product,
      as: 'product',
      attributes: ['name'],
      required: true,
      where: {
        deletedAt: null,
        is_discontinued: false,
      },
    }],
    attributes: ['id', 'product_id', 'slug', 'stock', 'low_stock_threshold', 'is_discontinued'],
  });
}

async function fetchSalesByVariantId(variantIds, since) {
  if (!variantIds.length) {
    return new Map();
  }

  const salesRows = await sequelize.query(
    `
    SELECT
      oi.variant_id AS variantId,
      SUM(oi.quantity) AS totalQuantity,
      SUM(oi.total) AS totalAmount
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    WHERE oi.variant_id IN (:variantIds)
      AND oi.createdAt >= :since
      AND oi.deletedAt IS NULL
      AND o.deletedAt IS NULL
      AND o.status IN (:statuses)
    GROUP BY oi.variant_id
    `,
    {
      replacements: {
        variantIds,
        since,
        statuses: SUCCESSFUL_ORDER_STATUSES,
      },
      type: QueryTypes.SELECT,
    }
  );

  const salesByVariantId = new Map();
  for (const row of salesRows) {
    salesByVariantId.set(Number(row.variantId), {
      totalQuantity: parseInt(row.totalQuantity || 0, 10),
      totalAmount: parseFloat(row.totalAmount || 0),
    });
  }
  return salesByVariantId;
}

// Run every hour at minute 0
cron.schedule('0 * * * *', async () => {
  try {
    const lowStockVariants = await fetchLowStockVariants();
    if (lowStockVariants.length === 0) {
      return;
    }

    const twentyEightDaysAgo = moment()
      .tz(process.env.UK_TIMEZONE || 'Europe/London')
      .subtract(28, 'days')
      .startOf('day')
      .toDate();

    const variantIds = lowStockVariants.map((v) => v.id);
    const salesByVariantId = await fetchSalesByVariantId(variantIds, twentyEightDaysAgo);

    const lowStockList = lowStockVariants.map((v) => {
      const sales = salesByVariantId.get(v.id) || { totalQuantity: 0, totalAmount: 0 };
      return {
        productName: v.product?.name || `Product ID: ${v.product_id}`,
        variantName: v.slug || v.id,
        stock: v.stock,
        low_stock_threshold: v.low_stock_threshold,
        status: v.stock === 0 ? 'Out of Stock' : 'Low Stock',
        last28DaysSales: sales.totalQuantity,
        last28DaysAmount: sales.totalAmount.toFixed(2),
      };
    });

    const outOfStockCount = lowStockList.filter((item) => item.status === 'Out of Stock').length;
    const lowStockCount = lowStockList.filter((item) => item.status === 'Low Stock').length;

    const data = {
      emailTypes: constants.emailTypes.INVENTORY_LOW_STOCK,
      to: process.env.ADMIN_EMAIL || 'admin@vapehub.co.uk',
      context: {
        lowStockList,
        totalLowStockCount: lowStockList.length,
        outOfStockCount,
        lowStockCount,
      },
      attachments: '',
    };
    await sendEmail(data.to, data.emailTypes, data.context, data.attachments);
  } catch (error) {
    console.error('Error in low stock cron:', error);
  }
}, {
  timezone: process.env.UK_TIMEZONE || 'Europe/London',
});
