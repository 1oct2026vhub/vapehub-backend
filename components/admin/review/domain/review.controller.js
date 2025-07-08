const { Review, Product, User } = require('../../../../models');
const { Op } = require('sequelize');

module.exports = {
  async list(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;
      
      // Extract search and filter parameters
      const { search, rating, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
      
      // Build where clause for filtering
      const whereClause = {};
      
      // Filter by rating if provided
      if (rating && rating !== 'all') {
        whereClause.rating = parseInt(rating);
      }
      
      // Build include clause for searching
      const includeClause = [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false
        },
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'slug'],
          required: false
        }
      ];
      
      // Add search conditions if search term is provided
      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        
        // Search in user name (first_name + last_name)
        includeClause[0].where = {
          [Op.or]: [
            { first_name: { [Op.like]: searchTerm } },
            { last_name: { [Op.like]: searchTerm } },
            { email: { [Op.like]: searchTerm } }
          ]
        };
        includeClause[0].required = true;
        
        // Search in product name
        includeClause[1].where = {
          name: { [Op.like]: searchTerm }
        };
        includeClause[1].required = true;
        
        // Also search in review comment
        whereClause[Op.or] = [
          { comment: { [Op.like]: searchTerm } },
          { user_name: { [Op.like]: searchTerm } }
        ];
      }
      
      // Validate sort parameters
      const validSortFields = ['created_at', 'rating', 'user_name', 'comment'];
      const validSortOrders = ['ASC', 'DESC'];
      
      const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
      const finalSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
      
      const { count, rows } = await Review.findAndCountAll({
        where: whereClause,
        include: includeClause,
        offset,
        limit,
        order: [[finalSortBy, finalSortOrder]],
        distinct: true // Important for correct count with includes
      });
      
      // Transform the response to include user and product info
      const transformedReviews = rows.map(review => {
        const reviewData = review.toJSON();
        
        // Add user info
        if (reviewData.user) {
          reviewData.user_name = `${reviewData.user.first_name || ''} ${reviewData.user.last_name || ''}`.trim();
          reviewData.user_email = reviewData.user.email;
        }
        
        // Add product info
        if (reviewData.product) {
          reviewData.product_name = reviewData.product.name;
          reviewData.product_slug = reviewData.product.slug;
        }
        
        return reviewData;
      });
      
      // Get rating statistics for all reviews (not filtered)
      const ratingStats = await Review.findAll({
        attributes: [
          'rating',
          [require('sequelize').fn('COUNT', require('sequelize').col('rating')), 'count']
        ],
        group: ['rating'],
        order: [['rating', 'DESC']]
      });
      
      // Transform rating stats
      const ratingStatistics = ratingStats.reduce((acc, stat) => {
        acc[stat.rating] = parseInt(stat.dataValues.count);
        return acc;
      }, {});
      
      res.json({
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        reviews: transformedReviews,
        filters: {
          search: search || '',
          rating: rating || 'all',
          sortBy: finalSortBy,
          sortOrder: finalSortOrder
        },
        statistics: {
          ratingDistribution: ratingStatistics,
          totalReviews: await Review.count()
        }
      });
    } catch (err) {
      console.error('Error in review list:', err);
      res.status(500).json({ error: err.message });
    }
  },

//   async getById(req, res) {
//     try {
//       const review = await Review.findByPk(req.params.id);
//       if (!review) return res.status(404).json({ error: 'Review not found' });
//       res.json(review);
//     } catch (err) {
//       res.status(500).json({ error: err.message });
//     }
//   },

  async create(req, res) {
    try {
      const review = await Review.create({
        ...req.body,
        verified_by: true // Set default to 1 (true)
      });
      res.status(201).json(review);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const review = await Review.findByPk(req.params.id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      await review.update(req.body);
      res.json(review);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      const review = await Review.findByPk(req.params.id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      await review.destroy();
      res.json({ message: 'Review deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Unified function for fetching all or searching products by name
  async getProducts(req, res) {
    try {
      const { q } = req.query;
      const where = q && q.length > 0
        ? { name: { [require('sequelize').Op.like]: `%${q}%` } }
        : undefined;
      const limit = q && q.length > 0 ? undefined : 10;
      const products = await Product.findAll({
        where,
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
        ...(limit ? { limit } : {})
      });
      res.json(products);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}; 