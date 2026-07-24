const { Brand } = require('../../../models');
const { findBuyingGuideByBrandId } = require('../../admin/brand/helper/buyingGuideRelations.helper');
const { getPublicBuyingGuideBySlug } = require('../../category/helper/publicBuyingGuide.handler');

module.exports.getBuyingGuideBySlug = async (req, res) => {
    return getPublicBuyingGuideBySlug(req, res, {
        findEntityBySlug: (slug) => Brand.findOne({ where: { slug }, paranoid: true }),
        findGuideByEntityId: findBuyingGuideByBrandId,
        entityNotFoundMessage: 'Brand not found'
    });
};
