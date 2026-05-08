// Your router setup
const router = require("express").Router();

router.get("/", (req, res) => {
    res.send("Vape Hub restricted requests");
});

router.post("/", (req, res) => {
    res.send("Vape Hub restricted requests");
});

// This should be under the correct path
router.use('/auth', require('./auth/routes/auth.route'));
router.use('/user', require('./user/routes/user.route'));
router.use('/customer', require('./customer/routes/customer.route'));
router.use('/category', require('./category/routes/category.route'));
router.use('/brand', require('./brand/routes/brand.route'));
router.use('/products', require('./product/routes/product.route'));
router.use('/attributes', require('./productAttributes/routes/attribute.route'));
router.use('/attribute-terms', require('./productAttributes/routes/attributeTerms.route'));
router.use('/stock-management', require('./product/routes/stockManagement.route'));
router.use('/product-variants', require('./product/routes/productVariant.route'));
router.use('/shipping-methods', require('./shippingMethod/routes/shippingMethod.route'));
router.use('/banners', require('./banner/routes/banner.route'));
router.use('/carousels', require('./carousels/routes/carousel.route'));
router.use('/blog', require('./blog/routes/blog.route'));
router.use('/orders', require('./order/routes/order.route'));
router.use('/transactions', require('./transaction/routes/transaction.route'));
router.use('/dashboard', require('./dashboard/routes/dashboard.route'));
router.use('/footer', require('./footer/routes/footer.route'));
router.use('/menus', require('./menu/routes/menu.route'));
router.use('/seo', require('./seo/routes/seo.route'));
router.use('/faqs', require('./faq/routes/faq.route'));
router.use('/deals', require('./deals/routes/deals.route'));
router.use('/referral-method', require('./referralMethod/routes/referralMethod.route'));
router.use('/coupons', require('./coupon/routes/coupon.route'));
router.use('/flash-news', require('./flashNews/routes/flashNews.route'));
router.use('/review', require('./review/routes/review.route'));
router.use('/inventory', require('./inventory/routes/inventory.route'));
router.use('/shipStation', require('./shipStation/routes/shipStation.route'));
router.use('/shipStationWebhook', require('./shipStationWebhook/routes/shipStationWebhook.route'));
router.use('/loyalty-points', require('./loyaltyPoints/routes/loyaltyPoints.route'));
router.use('/mail-subscription-settings', require('./mailSubscriptionSettings/routes/mailSubscriptionSettings.route'));
router.use('/contactus', require('./contactus/routes/contactus.route'));
router.use('/welcome-content', require('./welcomeContent/routes/welcomeContent.route'));
router.use('/feature-content', require('./featureContent/routes/featureContent.route'));
router.use('/settings', require('./settings/routes/settings.route'));
router.use('/popularCategory', require('./popularCategory/routes/popularCategory.route'));
router.use('/shopByCategory', require('./shopByCategory/routes/shopByCategory.route'));
router.use('/abandoned-carts', require('./abandonedCart/routes/abandonedCart.route'));
router.use('/newsletter-templates', require('./newsletterTemplates/routes/newsletterTemplates.route'));

module.exports = router;