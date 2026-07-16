const { Category } = require('../../../models');
const { findBuyingGuideByCategoryId } = require('../../admin/category/helper/buyingGuideRelations.helper');
const { getPublicBuyingGuideBySlug } = require('../helper/publicBuyingGuide.handler');

module.exports.getBuyingGuideBySlug = async (req, res) => {
    return getPublicBuyingGuideBySlug(req, res, {
        findEntityBySlug: (slug) => Category.findOne({ where: { slug }, paranoid: true }),
        findGuideByEntityId: findBuyingGuideByCategoryId,
        entityNotFoundMessage: 'Category not found'
    });
};
