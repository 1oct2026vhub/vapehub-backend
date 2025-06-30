const { Review, Product } = require('../../../../models');

module.exports = {
  async list(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      const { count, rows } = await Review.findAndCountAll({
        offset,
        limit,
        order: [['created_at', 'DESC']]
      });

      res.json({
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        reviews: rows
      });
    } catch (err) {
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
      const review = await Review.create(req.body);
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
      console.log("req.query>>>>", req.query);
      const { q } = req.query;
      console.log(q);
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
      console.log(products);
      res.json(products);
    } catch (err) {
      console.log("err>>>>", err);
      res.status(500).json({ error: err.message });
    }
  }
}; 