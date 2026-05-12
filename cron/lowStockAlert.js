const cron = require('node-cron');
const { Op } = require('sequelize');
const { ProductVariant, Product, Order, OrderItem } = require('../models');
const sendEmail = require('../library/sendEmail');
const constants = require('../config/constants');
const moment = require('moment-timezone');

// Run every hour at minute 0
cron.schedule('0 * * * *', async () => {
  try {
    // Find all low stock variants (stock > 0 and stock <= low_stock_threshold) and out of stock variants (stock = 0)
    const lowStockVariants = await ProductVariant.findAll({
      where: {
        stock: { [Op.gte]: 0 } // Changed from Op.gt to Op.gte to include stock = 0
      },
      include: [{
        model: Product,
        as: 'product',
        attributes: ['name'],
        where: {
          deletedAt: null // Only include non-soft deleted products
        }
      }]
    });
    // Filter in JS for variants where stock <= low_stock_threshold (includes out of stock)
    const lowStockVariantsFiltered = lowStockVariants.filter(v => v.stock <= v.low_stock_threshold);
    // Calculate last 28 days sales for each low stock variant
    const lowStockList = await Promise.all(lowStockVariantsFiltered.map(async (v) => {
      const twentyEightDaysAgo = moment().tz(process.env.UK_TIMEZONE || 'Europe/London').subtract(28, 'days').startOf('day');
      
      // Get sales data for this variant in last 28 days
      const salesData = await OrderItem.findAll({
        where: {
          variant_id: v.id,
          createdAt: {
            [Op.gte]: twentyEightDaysAgo.toDate()
          }
        },
        include: [{
          model: Order,
          as: 'Order',
          where: {
            status: {
              [Op.in]: ['completed', 'delivered', 'shipped']
            }
          },
          attributes: []
        }],
        attributes: [
          [require('sequelize').fn('SUM', require('sequelize').col('quantity')), 'totalQuantity'],
          [require('sequelize').fn('SUM', require('sequelize').col('OrderItem.total')), 'totalAmount']
        ],
        raw: true
      });
      
      const salesCount = parseInt(salesData[0]?.totalQuantity || 0);
      const salesAmount = parseFloat(salesData[0]?.totalAmount || 0);
      return {
        productName: v.product?.name || `Product ID: ${v.product_id}`,
        variantName: v.slug || v.id,
        stock: v.stock,
        low_stock_threshold: v.low_stock_threshold,
        status: v.stock === 0 ? 'Out of Stock' : 'Low Stock',
        last28DaysSales: salesCount,
        last28DaysAmount: salesAmount.toFixed(2)
      };
    }));
    // Only send email if there are low stock or out of stock items
    if (lowStockList.length > 0) {
      const outOfStockCount = lowStockList.filter(item => item.status === 'Out of Stock').length;
      const lowStockCount = lowStockList.filter(item => item.status === 'Low Stock').length;
      
      const data = {
        emailTypes: constants.emailTypes.INVENTORY_LOW_STOCK,
        to: process.env.ADMIN_EMAIL || 'admin@vapehub.co.uk',
        context: {
            lowStockList: lowStockList,
            totalLowStockCount: lowStockList.length,
            outOfStockCount: outOfStockCount,
            lowStockCount: lowStockCount,
            // FRONTEND_URL: process.env.FRONTEND_URL
        },
        attachments: ""
      };
      await sendEmail(data.to, data.emailTypes, data.context, data.attachments);
    }
    //  else {
    //   console.log('No low stock variants found - no email sent');
    // }
  } catch (error) {
    console.error('Error in low stock cron:', error);
  }
}, {
  timezone: process.env.UK_TIMEZONE || 'Europe/London'
}); 