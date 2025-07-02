const cron = require('node-cron');
const { Op } = require('sequelize');
const { ProductVariant, Product } = require('../models');
const sendEmail = require('../library/sendEmail');
const constants = require('../config/constants');

// Run every hour at minute 0
cron.schedule('0 * * * *', async () => {
  try {
    // Find all low stock variants (stock > 0 and stock <= low_stock_threshold)
    const lowStockVariants = await ProductVariant.findAll({
      where: {
        stock: { [Op.gt]: 0 }
      },
      include: [{
        model: Product,
        as: 'product',
        attributes: ['name']
      }]
    });

    // Filter in JS for variants where stock <= low_stock_threshold
    const lowStockList = lowStockVariants.filter(v => v.stock <= v.low_stock_threshold)
      .map(v => ({
        productName: v.product?.name || 'N/A',
        variantName: v.slug || v.id,
        stock: v.stock,
        low_stock_threshold: v.low_stock_threshold
      }));

    if (lowStockList.length > 0) {
      const data = {
        emailTypes: constants.emailTypes.INVENTORY_LOW_STOCK,
        to: 'admin@example.com',
        context: {
            lowStockList: lowStockList,
            // FRONTEND_URL: process.env.FRONTEND_URL
        },
        attachments: ""
    };
      await sendEmail(data.to, data.emailTypes, data.context, data.attachments);
    } else {
      console.log('No low stock variants found');
    }
  } catch (error) {
    console.error('Error in low stock cron:', error);
  }
}, {
  timezone: process.env.UK_TIMEZONE || 'Europe/London'
}); 