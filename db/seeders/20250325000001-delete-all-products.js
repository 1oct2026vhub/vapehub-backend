'use strict';

const { deleteFile } = require('../../library/s3/s3Helper');
const url = require('url');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return;
    console.log('Starting to delete all products without variants and associated data...');
    
    // Start a transaction
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Get all products that don't have any product variants
      const products = await queryInterface.sequelize.query(
        `SELECT p.id 
         FROM products p 
         LEFT JOIN product_variants pv ON p.id = pv.product_id 
         WHERE pv.id IS NULL`,
        { 
          type: Sequelize.QueryTypes.SELECT,
          transaction 
        }
      );
      
      console.log(`Found ${products.length} products without variants to delete`);
      
      if (products.length === 0) {
        console.log('No products without variants found. Nothing to delete.');
        await transaction.commit();
        return;
      }
      
      // Get all product images
      const productImages = await queryInterface.sequelize.query(
        'SELECT id, product_id, image_url FROM product_images WHERE product_id IN (:productIds)',
        { 
          replacements: { productIds: products.map(p => p.id) },
          type: Sequelize.QueryTypes.SELECT,
          transaction 
        }
      );
      
      console.log(`Found ${productImages.length} product images to delete`);
      
      // Delete images from S3
      for (const image of productImages) {
        try {
          // Extract the key from the S3 URL
          const imageUrl = image.image_url;
          if (imageUrl && imageUrl.includes(process.env.AWS_S3_BUCKET)) {
            const parsedUrl = url.parse(imageUrl);
            const key = parsedUrl.pathname.substring(1); // Remove leading slash
            
            console.log(`Attempting to delete S3 image: ${key}`);
            await deleteFile(key);
            console.log(`Successfully deleted S3 image: ${key}`);
          } else {
            console.log(`Skipping non-S3 image: ${imageUrl}`);
          }
        } catch (error) {
          console.error(`Error deleting S3 image for product image ID ${image.id}:`, error.message);
          // Rollback transaction if S3 deletion fails
          await transaction.rollback();
          throw error;
        }
      }
      
      // Delete cart items - FORCE DELETE
      const deletedCartItems = await queryInterface.sequelize.query(
        'DELETE FROM carts WHERE product_id IN (:productIds)',
        { 
          replacements: { productIds: products.map(p => p.id) },
          type: Sequelize.QueryTypes.DELETE,
          transaction 
        }
      );
      
      console.log(`Force deleted ${deletedCartItems} cart items`);
      
      // Get order IDs that have items with these products
      const orderIds = await queryInterface.sequelize.query(
        'SELECT DISTINCT order_id FROM order_items WHERE product_id IN (:productIds)',
        { 
          replacements: { productIds: products.map(p => p.id) },
          type: Sequelize.QueryTypes.SELECT,
          transaction 
        }
      );
      
      if (orderIds.length > 0) {
        console.log(`Found ${orderIds.length} orders with items containing these products`);
        
        // Delete order items - FORCE DELETE
        const deletedOrderItems = await queryInterface.sequelize.query(
          'DELETE FROM order_items WHERE product_id IN (:productIds)',
          { 
            replacements: { productIds: products.map(p => p.id) },
            type: Sequelize.QueryTypes.DELETE,
            transaction 
          }
        );
        
        console.log(`Force deleted ${deletedOrderItems} order items`);
        
        // Delete orders that have no items left - FORCE DELETE
        const deletedOrders = await queryInterface.sequelize.query(
          `DELETE FROM orders 
           WHERE id IN (
             SELECT o.id 
             FROM orders o 
             LEFT JOIN order_items oi ON o.id = oi.order_id 
             WHERE oi.id IS NULL
           )`,
          { 
            type: Sequelize.QueryTypes.DELETE,
            transaction 
          }
        );
        
        console.log(`Force deleted ${deletedOrders} orders that had no items left`);
      } else {
        console.log('No orders found with items containing these products');
      }
      
      // Delete product attribute terms - FORCE DELETE
      const deletedAttributeTerms = await queryInterface.sequelize.query(
        'DELETE FROM product_attribute_terms WHERE product_id IN (:productIds)',
        { 
          replacements: { productIds: products.map(p => p.id) },
          type: Sequelize.QueryTypes.DELETE,
          transaction 
        }
      );
      
      console.log(`Force deleted ${deletedAttributeTerms} product attribute terms`);
      
      // Delete product images - FORCE DELETE
      const deletedImages = await queryInterface.sequelize.query(
        'DELETE FROM product_images WHERE product_id IN (:productIds)',
        { 
          replacements: { productIds: products.map(p => p.id) },
          type: Sequelize.QueryTypes.DELETE,
          transaction 
        }
      );
      
      console.log(`Force deleted ${deletedImages} product images`);
      
      // Delete product flavors - FORCE DELETE
      // const deletedFlavors = await queryInterface.sequelize.query(
      //   'DELETE FROM ProductFlavors WHERE product_id IN (:productIds)',
      //   { 
      //     replacements: { productIds: products.map(p => p.id) },
      //     type: Sequelize.QueryTypes.DELETE,
      //     transaction 
      //   }
      // );
      
      // console.log(`Force deleted ${deletedFlavors} product flavors`);
      
      // Delete products - FORCE DELETE
      const deletedProducts = await queryInterface.sequelize.query(
        'DELETE FROM products WHERE id IN (:productIds)',
        { 
          replacements: { productIds: products.map(p => p.id) },
          type: Sequelize.QueryTypes.DELETE,
          transaction 
        }
      );
      
      console.log(`Force deleted ${deletedProducts} products without variants`);
      
      // Commit the transaction if everything is successful
      await transaction.commit();
      console.log('Successfully force deleted all products without variants and associated data');
    } catch (error) {
      // Rollback the transaction if any error occurs
      await transaction.rollback();
      console.error('Error deleting products:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    return;
    // This is a destructive operation, so there's no way to restore the data
    console.log('This seeder cannot be reverted as it permanently deletes data');
  }
}; 