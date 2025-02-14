const { sequelize } = require("../../../models");  // Destructure to get the instance
const crypto = require('crypto');

async function getTrendingProducts(limit = 10) {
  const currentDate = new Date();
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const trendingProducts = await sequelize.query(`
      SELECT 
        p.id, 
        p.name, 
        p.slug, 
        p.price, 
        p.discount_price, 
        COUNT(o.id) AS order_count
      FROM 
        orders o
      JOIN 
        products p ON o.product_id = p.id
      WHERE 
        o.createdAt BETWEEN :startOfMonth AND :endOfMonth
      GROUP BY 
        p.id
      ORDER BY 
        order_count DESC
      LIMIT :limit
    `, {
    replacements: { startOfMonth, endOfMonth, limit },
    type: sequelize.QueryTypes.SELECT,
  });

  return trendingProducts;
}
// Helper function to generate unique filename
const generateUniqueFileName = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = originalName.split('.').pop();
  return `${timestamp}-${randomString}.${extension}`;
};
module.exports = { getTrendingProducts, generateUniqueFileName };