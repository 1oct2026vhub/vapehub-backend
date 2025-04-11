const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { Transaction, User, Order, OrderItem, Product, ProductVariant, ShippingMethod, UserAddress } = require('../../../../models');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const moment = require('moment');
const { Parser } = require('json2csv');

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
      where.createdAt = {
        [Op.between]: [startDate, endDate]
      };
    }
    if (search) {
      where[Op.or] = [
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
        { model: User, as: 'user' },
        { model: Order, as: 'order',
          include: [
            { model: OrderItem, as: 'orderItems',
              include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'slug'] },
                { model: ProductVariant, as: 'variant', attributes: ['id', 'barcode', 'price', 'slug'] }
              ]
            },
            { model: ShippingMethod, as: 'shippingMethod', attributes: ['id', 'shipping_method', 'shipping_cost'], required: false },
            { model: UserAddress, as: 'shippingAddress', attributes: ['id', 'name', 'last_name', 'street', 'town', 'county', 'post_code', 'country', 'phone'], required: false },
            { model: UserAddress, as: 'billingAddress', attributes: ['id', 'name', 'last_name', 'street', 'town', 'county', 'post_code', 'country', 'phone'], required: false }
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
      const now = new Date();
      end_date = now.toISOString().split('T')[0]; // Today
      start_date = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0];
    }

    if (isNaN(new Date(start_date)) || isNaN(new Date(end_date))) {
      return errorResponse(res, null, 'Invalid date format. Please use YYYY-MM-DD');
    }

    // Fetch total revenue from the database
    const totalRevenue = await Transaction.getTotalRevenue(start_date, end_date);

    return successResponse(res, { 
      totalRevenue, 
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
      const startDate = new Date(start_date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);

      where.createdAt = {
        [Op.between]: [startDate, endDate]
      };
    }

    // Add status filter
    if (status) {
      where.status = status;
    }

    const transactions = await Transaction.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] },
        { model: Order, as: 'order', attributes: ['id', 'order_unique_id'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (format === 'csv') {
      // Prepare data for CSV
      const csvFields = ['ID','Reference', 'Order ID', 'Status', 'Customer', 'Email', 'Type', 'Payment Method', 'Amount', 'Date'];
      const csvData = transactions.map(transaction => {
        const customerName = transaction.user ? `${transaction.user.first_name} ${transaction.user.last_name}` : 'N/A';
        const customerEmail = transaction.user ? transaction.user.email : 'N/A';
        const orderId = transaction.order ? transaction.order.order_unique_id : 'N/A';

        return {
          ID: transaction.id,
          reference: transaction.referenceNumber || 'N/A',
          orderId,
          status: transaction.status,
          customerName,
          customerEmail,
          type: transaction.transactionType || 'N/A',
          paymentMethod: transaction.paymentMethod || 'N/A',
          amount: transaction.amount,
          date: moment(transaction.createdAt).format('YYYY-MM-DD HH:mm:ss')
        };
      });

      const json2csvParser = new Parser({ fields: csvFields });
      const csv = json2csvParser.parse(csvData);

      // Set response headers for CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=transactions-report-${moment().format('YYYY-MM-DD')}.csv`);

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
        const customerName = transaction.user ? `${transaction.user.first_name} ${transaction.user.last_name}` : 'N/A';
        const customerEmail = transaction.user ? transaction.user.email : 'N/A';
        const orderId = transaction.order ? transaction.order.order_unique_id : 'N/A';

        worksheet.addRow({
          id: transaction.id,
          reference: transaction.referenceNumber || 'N/A',
          orderId,
          status: transaction.status,
          customerName,
          customerEmail,
          type: transaction.transactionType || 'N/A',
          paymentMethod: transaction.paymentMethod || 'N/A',
          amount: transaction.amount,
          date: moment(transaction.createdAt).format('YYYY-MM-DD HH:mm:ss')
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
        `attachment; filename=transactions-report-${moment().format('YYYY-MM-DD')}.xlsx`
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