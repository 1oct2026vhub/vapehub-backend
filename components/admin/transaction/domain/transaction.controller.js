const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { Transaction, User, Order, OrderItem, Product, ProductVariant, ShippingMethod, UserAddress, ProductVariantImage, ProductVariantAttribute, Attribute, AttributeTerm, Coupon } = require('../../../../models');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const moment = require('moment');
const { Parser } = require('json2csv');
const { transactionStatus, transactionTypes, transactionStatusEnums, transactionTypeEnums } = require('../../../../config/constants');
const { formatNumber } = require('../../../../utils/dateUtils');

// List all transactions with pagination and filtering
exports.listTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, userId, orderId, status, transactionType, startDate, endDate, sortBy, sortOrder, search } = req.query;

    const where = {};
    if (userId) where.userId = userId;
    if (orderId) where.orderId = orderId;
    if (status) where.status = status;
    if (transactionType) where.transactionType = transactionType;
    if (startDate && endDate) {
      const startMoment = moment(startDate);
      const endMoment = moment(endDate);
      
      // Set start of day for start date and end of day for end date
      const startDateTime = startMoment.startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const endDateTime = endMoment.endOf('day').format('YYYY-MM-DD HH:mm:ss');
      
      where.createdAt = {
        [Op.between]: [startDateTime, endDateTime]
      };
    }
    if (search) {
      // Split search term into parts for full name search
      const searchTerms = search.trim().split(/\s+/);
      
      where[Op.or] = [
        // Match full name combinations
        ...searchTerms.map((term, index) => ({
          [Op.and]: [
            { '$user.first_name$': { [Op.like]: `%${term}%` } },
            ...searchTerms.slice(index + 1).map(nextTerm => ({
              '$user.last_name$': { [Op.like]: `%${nextTerm}%` }
            }))
          ]
        })),
        // Match individual fields
        { '$user.first_name$': { [Op.like]: `%${search}%` } },
        { '$user.last_name$': { [Op.like]: `%${search}%` } },
        { '$user.email$': { [Op.like]: `%${search}%` } },
        { amount: { [Op.like]: `%${search}%` } },
        { referenceNumber: { [Op.like]: `%${search}%` } },
        { paymentMethod: { [Op.like]: `%${search}%` } },
        { '$order.order_unique_id$': { [Op.like]: `%${search}%` } }
      ];
    }

    const order = sortBy ? [[sortBy, sortOrder || 'DESC']] : [['createdAt', 'DESC']];

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      order,
      limit: parseInt(limit),
      offset: (page - 1) * limit,
      include: [{ model: User, as: 'user' }, { model: Order, as: 'order' }]
    });

    const response = {
      transactions: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    };

    successResponse(res, response, 'Success');
  } catch (error) {
    console.error('listTransactions error:', error);
    return errorResponse(res, error, error.message);
  }
};

// View transaction details
exports.getTransactionDetails = async (req, res) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id, {
      include: [
        { 
          model: User, 
          as: 'user', 
          paranoid: false 
        },
        { 
          model: Order, 
          as: 'order',
          include: [
            { 
              model: OrderItem, 
              as: 'orderItems',
              include: [
                { 
                  model: Product, 
                  as: 'product', 
                  attributes: ['id', 'name', 'slug'], 
                  paranoid: false 
                },
                { 
                  model: ProductVariant, 
                  as: 'variant', 
                  attributes: ['id', 'barcode', 'price', 'slug', 'stock'], 
                  paranoid: false,
                  where: {
                    id: { [Op.col]: 'order->orderItems.variant_id' }
                  },
                  include: [
                    { 
                      model: ProductVariantImage, 
                      as: 'variantImages', 
                      attributes: ['id', 'image_url', 'is_primary'], 
                      where: { is_primary: true },
                      required: false,
                      paranoid: false
                    },
                    {
                      model: ProductVariantAttribute,
                      as: 'variantAttributes',
                      paranoid: false,
                      attributes: ['id', 'variant_id', 'attribute_id', 'term_id', 'created_at', 'updated_at'],
                      include: [
                        { model: Attribute, as: 'attribute', paranoid: false, attributes: ['id', 'name'] },
                        { model: AttributeTerm, as: 'term', paranoid: false, attributes: ['id', 'attribute_id', 'name'] }
                      ]
                    }
                  ]
                }
              ]
            },
            { 
              model: ShippingMethod, 
              as: 'shippingMethod', 
              attributes: ['id', 'shipping_method', 'shipping_cost'], 
              required: false 
            },
            { 
              model: UserAddress, 
              as: 'shippingAddress', 
              attributes: ['id', 'name', 'last_name', 'street', 'town', 'county', 'post_code', 'country', 'phone'], 
              required: false 
            },
            { 
              model: UserAddress, 
              as: 'billingAddress', 
              attributes: ['id', 'name', 'last_name', 'street', 'town', 'county', 'post_code', 'country', 'phone'], 
              required: false 
            },
            {
              model: Coupon,
              as: 'coupon',
              attributes: ['id', 'code', 'description', 'discount_type', 'discount_value', 'minimum_purchase', 'maximum_discount'],
              required: false
            }
          ]
        }
      ]
    });

    if (!transaction) {
      const error = new Error('Transaction not found');
      error.statusCode = 404;
      throw error;
    }

    successResponse(res, transaction, 'Success');
  } catch (error) {
    return errorResponse(res, error, error.message);
  }
};

// Update transaction status
exports.updateTransactionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    // Validate status against constants
    if (!transactionStatusEnums.includes(status)) {
      const error = new Error(`Invalid status. Must be one of: ${transactionStatusEnums.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }
    
    const transaction = await Transaction.findByPk(req.params.id);

    if (!transaction) {
      const error = new Error('Transaction not found');
      error.statusCode = 404;
      throw error;
    }

    await transaction.updateStatus(status);
    successResponse(res, transaction, 'Transaction status updated successfully');
  } catch (error) {
    return errorResponse(res, error, error.message);
  }
};

// Refund or cancel transaction
exports.refundTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findByPk(req.params.id);

    if (!transaction) {
      const error = new Error('Transaction not found');
      error.statusCode = 404;
      throw error;
    }

    // Implement refund logic here
    // Update transaction status and log refund details in metadata
    successResponse(res, transaction, 'Transaction refunded successfully');
  } catch (error) {
    return errorResponse(res, error, error.message);
  }
};

// Generate revenue reports
exports.generateRevenueReport = async (req, res) => {
  try {
    let { start_date, end_date } = req.query;

    // Validate date inputs
    if (!start_date || !end_date) {
      const now = moment();
      end_date = now.format('YYYY-MM-DD'); // Today
      start_date = now.subtract(30, 'days').format('YYYY-MM-DD');
    }

    if (!moment(start_date, 'YYYY-MM-DD', true).isValid() || !moment(end_date, 'YYYY-MM-DD', true).isValid()) {
      return errorResponse(res, null, 'Invalid date format. Please use YYYY-MM-DD');
    }

    // Fetch total revenue from the database
    const totalRevenue = await Transaction.getTotalRevenue(start_date, end_date);

    return successResponse(res, { 
      totalRevenue: totalRevenue,
      totalRevenue_abbreviated: formatNumber(totalRevenue),
      start_date, 
      end_date 
    }, 'Revenue report generated successfully');
  } catch (error) {
    console.error('Error generating revenue report:', error);
    return errorResponse(res, error, 'Failed to generate revenue report');
  }
};

// Export transactions
exports.exportTransactions = async (req, res) => {
  try {
    const { start_date, end_date, status, format = 'excel' } = req.query;

    // Build where clause
    const where = {};

    // Add date range filter
    if (start_date && end_date) {
      const startMoment = moment(start_date);
      const endMoment = moment(end_date);
      
      // Set start of day for start date and end of day for end date
      const startDateTime = startMoment.startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const endDateTime = endMoment.endOf('day').format('YYYY-MM-DD HH:mm:ss');
      
      where.createdAt = {
        [Op.between]: [startDateTime, endDateTime]
      };
    }

    // Add status filter
    if (status) {
      // Validate status against constants
      if (!transactionStatusEnums.includes(status)) {
        const error = new Error(`Invalid status. Must be one of: ${transactionStatusEnums.join(', ')}`);
        error.statusCode = 400;
        throw error;
      }
      where.status = status;
    }

    console.log('Export query where clause:', JSON.stringify(where));

    const transactions = await Transaction.findAll({
      where,
      include: [
        { 
          model: User, 
          as: 'user', 
          attributes: ['id', 'first_name', 'last_name', 'email'], 
          paranoid: false,
          required: false
        },
        { 
          model: Order, 
          as: 'order', 
          attributes: ['id', 'order_unique_id'], 
          paranoid: false,
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    console.log(`Found ${transactions.length} transactions for export`);

    if (format === 'csv') {
      // Prepare data for CSV
      const csvFields = ['ID','Reference', 'Order ID', 'Status', 'Customer', 'Email', 'Type', 'Payment Method', 'Amount', 'Date'];
      const csvData = transactions.map(transaction => {
        const customerName = transaction.user ? `${transaction.user.first_name || ''} ${transaction.user.last_name || ''}`.trim() : 'N/A';
        const customerEmail = transaction.user ? transaction.user.email : 'N/A';
        const orderId = transaction.order ? transaction.order.order_unique_id : 'N/A';

        return {
          ID: transaction.id || 'N/A',
          Reference: transaction.referenceNumber || 'N/A',
          'Order ID': orderId,
          Status: transaction.status || 'N/A',
          Customer: customerName,
          Email: customerEmail,
          Type: transaction.transactionType || 'N/A',
          'Payment Method': transaction.paymentMethod || 'N/A',
          Amount: transaction.amount || '0',
          Date: transaction.createdAt ? moment(transaction.createdAt).format('DD-MM-YYYY HH:mm:ss') : 'N/A'
        };
      });

      const json2csvParser = new Parser({ fields: csvFields });
      const csv = json2csvParser.parse(csvData);

      // Set response headers for CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=transactions-report-${moment().format('DD-MM-YYYY')}.csv`);

      // Send CSV
      res.status(200).end(csv);
    } else {
      // Create a new workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Transactions');

      // Define columns
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 20 },
        { header: 'Reference', key: 'reference', width: 20 },
        { header: 'Order ID', key: 'orderId', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Customer', key: 'customerName', width: 30 },
        { header: 'Email', key: 'customerEmail', width: 30 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Payment Method', key: 'paymentMethod', width: 20 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Date', key: 'date', width: 20 }
      ];

      // Add data rows
      transactions.forEach(transaction => {
        const customerName = transaction.user ? `${transaction.user.first_name || ''} ${transaction.user.last_name || ''}`.trim() : 'N/A';
        const customerEmail = transaction.user ? transaction.user.email : 'N/A';
        const orderId = transaction.order ? transaction.order.order_unique_id : 'N/A';

        worksheet.addRow({
          id: transaction.id || 'N/A',
          reference: transaction.referenceNumber || 'N/A',
          orderId,
          status: transaction.status || 'N/A',
          customerName,
          customerEmail,
          type: transaction.transactionType || 'N/A',
          paymentMethod: transaction.paymentMethod || 'N/A',
          amount: transaction.amount || '0',
          date: transaction.createdAt ? moment(transaction.createdAt).format('DD-MM-YYYY HH:mm:ss') : 'N/A'
        });
      });

      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Set response headers for Excel
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=transactions-report-${moment().format('DD-MM-YYYY')}.xlsx`
      );

      // Send the workbook
      await workbook.xlsx.write(res);
      res.end();
    }
  } catch (error) {
    console.error('exportTransactions error:', error);
    return errorResponse(res, error, error.message);
  }
}; 