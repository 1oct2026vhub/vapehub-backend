// Your router setup
const express = require('express');
const router = express.Router();

// Import all admin route modules
const authRoutes = require('./auth/auth.route');
const userRoutes = require('./user/user.route');
const customerRoutes = require('./customer/customer.route');
const categoryRoutes = require('./category/category.route');
const brandRoutes = require('./brand/brand.route');
const productRoutes = require('./product/product.route');
const orderRoutes = require('./order/order.route');
const menuRoutes = require('./menu/menu.route');
const footerRoutes = require('./footer/footer.route');
const dashboardRoutes = require('./dashboard/dashboard.route');
const carouselsRoutes = require('./carousels/carousels.route');
const blogRoutes = require('./blog/blog.route');
const bannerRoutes = require('./banner/banner.route');
const seoRoutes = require('./seo/seo.route');

// Mount all admin routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/customers', customerRoutes);
router.use('/categories', categoryRoutes);
router.use('/brands', brandRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/menu', menuRoutes);
router.use('/footer', footerRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/carousels', carouselsRoutes);
router.use('/blog', blogRoutes);
router.use('/banner', bannerRoutes);
router.use('/seo', seoRoutes);

module.exports = router;
