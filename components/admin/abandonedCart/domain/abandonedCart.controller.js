const { Op } = require('sequelize');
const moment = require('moment');
const { AbandonedCartFlow, Order, User, Coupon } = require('../../../../models');
const { successResponse, errorResponse } = require('../../../../utils/responseUtils');

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];

const getPeriodStart = (period) => {
  const now = moment();
  switch (period) {
    case 'weekly':
      return now.clone().startOf('week');
    case 'monthly':
      return now.clone().startOf('month');
    case 'yearly':
      return now.clone().startOf('year');
    case 'daily':
    default:
      return now.clone().startOf('day');
  }
};

const getBucketKey = (date, period) => {
  const m = moment(date);
  if (period === 'yearly') return m.format('MMM');
  if (period === 'monthly') return m.format('YYYY-MM-DD');
  if (period === 'weekly') return m.format('ddd');
  return m.format('HH:00');
};

module.exports.listAbandonedCarts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      email_status,
      search,
      start_date,
      end_date
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 10, 1);
    const offset = (pageNumber - 1) * limitNumber;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (start_date && end_date) {
      where.createdAt = {
        [Op.between]: [
          moment(start_date).startOf('day').toDate(),
          moment(end_date).endOf('day').toDate()
        ]
      };
    }

    if (email_status === 'none') {
      where.first_email_sent_at = null;
      where.second_email_sent_at = null;
    } else if (email_status === 'email1_sent') {
      where.first_email_sent_at = { [Op.ne]: null };
    } else if (email_status === 'email2_sent') {
      where.second_email_sent_at = { [Op.ne]: null };
    }

    const orderWhere = {};
    const userWhere = {};
    if (search) {
      orderWhere[Op.or] = [
        { order_unique_id: { [Op.like]: `%${search}%` } },
        { id: { [Op.like]: `%${search}%` } }
      ];

      userWhere[Op.or] = [
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const { rows, count } = await AbandonedCartFlow.findAndCountAll({
      where,
      include: [
        {
          model: Order,
          as: 'order',
          required: false,
          where: Object.keys(orderWhere).length ? orderWhere : undefined,
          attributes: ['id', 'order_unique_id', 'status', 'total', 'createdAt']
        },
        {
          model: User,
          as: 'user',
          required: false,
          where: Object.keys(userWhere).length ? userWhere : undefined,
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Coupon,
          as: 'coupon',
          required: false,
          attributes: ['id', 'code', 'discount_value', 'discount_type']
        }
      ],
      order: [['createdAt', 'DESC']],
      offset,
      limit: limitNumber
    });

    return successResponse(
      res,
      {
        items: rows,
        pagination: {
          total: count,
          page: pageNumber,
          limit: limitNumber,
          total_pages: Math.ceil(count / limitNumber)
        }
      },
      'Abandoned carts fetched successfully'
    );
  } catch (error) {
    return errorResponse(res, error, 'Failed to fetch abandoned carts');
  }
};

module.exports.getAbandonedCartSummary = async (req, res) => {
  try {
    const period = PERIODS.includes(req.query.period) ? req.query.period : 'daily';
    const startDate = getPeriodStart(period).toDate();
    const endDate = moment().endOf('day').toDate();

    const flows = await AbandonedCartFlow.findAll({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        'id',
        'createdAt',
        'status',
        'first_email_sent_at',
        'second_email_sent_at',
        'recovered_at',
        'cancelled_at',
        'recovered_revenue'
      ]
    });

    const totals = {
      abandoned_carts: flows.length,
      email1_sent: 0,
      email2_sent: 0,
      recovered_orders: 0,
      cancelled_orders: 0,
      superseded_orders: 0,
      recovered_revenue: 0
    };

    const buckets = {};

    for (const flow of flows) {
      const plain = flow.get({ plain: true });
      const bucketKey = getBucketKey(plain.createdAt, period);
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          key: bucketKey,
          abandoned_carts: 0,
          email1_sent: 0,
          email2_sent: 0,
          recovered_orders: 0,
          cancelled_orders: 0,
          superseded_orders: 0,
          recovered_revenue: 0
        };
      }

      const bucket = buckets[bucketKey];
      bucket.abandoned_carts += 1;
      totals.abandoned_carts += 1;

      if (plain.first_email_sent_at) {
        bucket.email1_sent += 1;
        totals.email1_sent += 1;
      }
      if (plain.second_email_sent_at) {
        bucket.email2_sent += 1;
        totals.email2_sent += 1;
      }
      if (plain.recovered_at) {
        bucket.recovered_orders += 1;
        totals.recovered_orders += 1;
      }
      if (plain.cancelled_at) {
        bucket.cancelled_orders += 1;
        totals.cancelled_orders += 1;
      }
      if (plain.status === 'superseded') {
        bucket.superseded_orders += 1;
        totals.superseded_orders += 1;
      }

      const revenue = parseFloat(plain.recovered_revenue || 0);
      bucket.recovered_revenue += revenue;
      totals.recovered_revenue += revenue;
    }

    return successResponse(
      res,
      {
        period,
        range: { start_date: startDate, end_date: endDate },
        totals,
        performance: Object.values(buckets)
      },
      'Abandoned cart summary fetched successfully'
    );
  } catch (error) {
    return errorResponse(res, error, 'Failed to fetch abandoned cart summary');
  }
};

module.exports.getAbandonedCartByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;

    const flow = await AbandonedCartFlow.findOne({
      where: { order_id: orderId },
      include: [
        {
          model: Order,
          as: 'order',
          attributes: ['id', 'order_unique_id', 'status', 'total', 'createdAt', 'updatedAt']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Coupon,
          as: 'coupon',
          required: false,
          attributes: ['id', 'code', 'discount_value', 'discount_type', 'end_date']
        }
      ]
    });

    if (!flow) {
      return errorResponse(res, {}, 'Abandoned cart flow not found', 404);
    }

    return successResponse(res, flow, 'Abandoned cart flow fetched successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to fetch abandoned cart flow');
  }
};
