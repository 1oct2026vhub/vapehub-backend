// Your router setup
const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth/auth.route');
const userRoutes = require('./user/user.route');
const productRoutes = require('./product/product.route');
const categoryRoutes = require('./category/category.route');
const brandRoutes = require('./brand/brand.route');
const cartRoutes = require('./Cart/cart.route');
const checkoutRoutes = require('./checkout/checkout.route');
const orderRoutes = require('./order/order.route');
const shippingMethodRoutes = require('./shippingMethod/shippingMethod.route');
const paymentRoutes = require('./payment/payment.route');
const notificationRoutes = require('./notification/notification.route');
const menuRoutes = require('./menu/menu.route');
const footerRoutes = require('./footer/footer.route');
const blogRoutes = require('./blog/blog.route');
const seoRoutes = require('./seo/seo.route');

// Mount all routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/brands', brandRoutes);
router.use('/cart', cartRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/orders', orderRoutes);
router.use('/shipping-methods', shippingMethodRoutes);
router.use('/payment', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/menu', menuRoutes);
router.use('/footer', footerRoutes);
router.use('/blog', blogRoutes);
router.use('/seo', seoRoutes);

module.exports = router;
