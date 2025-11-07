const { Review, Product, User } = require('../../../../models');
const { Op } = require('sequelize');

module.exports = {
  async list(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;
      
      // Extract search and filter parameters
      const {
        search,
        rating,
        testimonial,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        deleted
      } = req.query;

      // Build where clause for filtering
      const whereClause = {};

      // Deleted filter (soft deletes)
      const includeDeleted = deleted === 'true';
      const paranoid = !includeDeleted;

      if (includeDeleted) {
        whereClause.deleted_at = { [Op.ne]: null };
      }
      
      // Filter by rating if provided
      if (rating && rating !== 'all') {
        whereClause.rating = parseInt(rating);
      }
      
      // Filter by testimonial if provided
      if (testimonial !== undefined) {
        whereClause.testimonial = testimonial === 'true' || testimonial === true;
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
        
        // Create OR condition for search across multiple fields
        whereClause[Op.or] = [
          // Search in review comment
          { comment: { [Op.like]: searchTerm } },
          { user_name: { [Op.like]: searchTerm } },
          // Search in user name (first_name + last_name) and email
          {
            '$user.first_name$': { [Op.like]: searchTerm }
          },
          {
            '$user.last_name$': { [Op.like]: searchTerm }
          },
          {
            '$user.email$': { [Op.like]: searchTerm }
          },
          // Search in product name
          {
            '$product.name$': { [Op.like]: searchTerm }
          }
        ];
      }
      
      // Validate sort parameters
      const validSortFields = ['created_at', 'rating', 'user_name', 'comment', 'testimonial'];
      const validSortOrders = ['ASC', 'DESC'];
      
      const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
      const finalSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
      
      const { count, rows } = await Review.findAndCountAll({
        where: whereClause,
        include: includeClause,
        offset,
        limit,
        order: [[finalSortBy, finalSortOrder]],
        distinct: true, // Important for correct count with includes
        paranoid
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
        order: [['rating', 'DESC']],
        paranoid
      });
      
      // Transform rating stats
      const ratingStatistics = ratingStats.reduce((acc, stat) => {
        acc[stat.rating] = parseInt(stat.dataValues.count);
        return acc;
      }, {});
      
      // Get testimonial statistics
      const testimonialCount = await Review.count({ where: { testimonial: true }, paranoid });
      const nonTestimonialCount = await Review.count({ where: { testimonial: false }, paranoid });
      
      res.json({
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        reviews: transformedReviews,
        filters: {
          search: search || '',
          rating: rating || 'all',
          testimonial: testimonial !== undefined ? testimonial : 'all',
          sortBy: finalSortBy,
          sortOrder: finalSortOrder,
          deleted: includeDeleted ? 'true' : 'false'
        },
        statistics: {
          ratingDistribution: ratingStatistics,
          totalReviews: await Review.count({ paranoid }),
          testimonialStats: {
            testimonials: testimonialCount,
            regularReviews: nonTestimonialCount
          }
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
        verified_by: true, // Set default to 1 (true)
        testimonial: req.body.testimonial || false // Set testimonial based on admin input, default to false
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

  async restore(req, res) {
    try {
      const review = await Review.findByPk(req.params.id, {
        paranoid: false
      });
      
      if (!review) {
        return res.status(404).json({ error: 'Review not found' });
      }

      if (!review.deleted_at) {
        return res.status(400).json({ error: 'Review is not deleted' });
      }

      await review.restore();
      res.json({ message: 'Review restored', review });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async bulkDelete(req, res) {
    try {
      const { ids } = req.body;

      const deletedReviews = [];
      const notDeletedReviews = [];

      for (const rawId of ids) {
        const id = Number(rawId);
        try {
          const review = await Review.findByPk(id);
          
          if (!review) {
            notDeletedReviews.push({ 
              id, 
              reason: 'Review not found' 
            });
            continue;
          }

          await review.destroy();

          deletedReviews.push({
            id: review.id,
            rating: review.rating,
            comment: review.comment ? review.comment.substring(0, 50) + '...' : null
          });
        } catch (error) {
          notDeletedReviews.push({
            id,
            reason: error.message || 'Failed to delete review'
          });
        }
      }

      const summary = {
        total_requested: ids.length,
        deleted_count: deletedReviews.length,
        not_deleted_count: notDeletedReviews.length
      };

      if (deletedReviews.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No reviews were deleted',
          deleted: deletedReviews,
          not_deleted: notDeletedReviews,
          summary
        });
      }

      res.json({
        success: true,
        message: `Successfully deleted ${deletedReviews.length} review(s)`,
        deleted: deletedReviews,
        not_deleted: notDeletedReviews,
        summary
      });
    } catch (err) {
      console.error('Error in bulk delete reviews:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async bulkRestore(req, res) {
    try {
      const { ids } = req.body;

      const restoredReviews = [];
      const notRestoredReviews = [];

      for (const rawId of ids) {
        const id = Number(rawId);
        try {
          const review = await Review.findByPk(id, {
            paranoid: false
          });
          
          if (!review) {
            notRestoredReviews.push({ 
              id, 
              reason: 'Review not found' 
            });
            continue;
          }

          if (!review.deleted_at) {
            notRestoredReviews.push({ 
              id,
              rating: review.rating,
              reason: 'Review is already active (not deleted)' 
            });
            continue;
          }

          await review.restore();

          restoredReviews.push({
            id: review.id,
            rating: review.rating,
            comment: review.comment ? review.comment.substring(0, 50) + '...' : null
          });
        } catch (error) {
          notRestoredReviews.push({
            id,
            reason: error.message || 'Failed to restore review'
          });
        }
      }

      const summary = {
        total_requested: ids.length,
        restored_count: restoredReviews.length,
        not_restored_count: notRestoredReviews.length
      };

      if (restoredReviews.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No reviews were restored',
          restored: restoredReviews,
          not_restored: notRestoredReviews,
          summary
        });
      }

      res.json({
        success: true,
        message: `Successfully restored ${restoredReviews.length} review(s)`,
        restored: restoredReviews,
        not_restored: notRestoredReviews,
        summary
      });
    } catch (err) {
      console.error('Error in bulk restore reviews:', err);
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