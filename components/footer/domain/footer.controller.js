const { FooterSection, FooterLink, Connect } = require('../../../models');
const { cacheOrFetch } = require('../../../library/cache');

const getFooterSections = async (req, res) => {
  try {
    const { is_active } = req.query;
    const cacheKey = `footer:sections:${is_active !== undefined ? is_active : 'active'}`;
    const responseData = await cacheOrFetch(cacheKey, async () => {
      const where = { is_active: true };
      if (is_active !== undefined) {
        where.is_active = is_active === 'true';
      }

      const sections = await FooterSection.findAll({
        where,
        order: [['order', 'ASC']],
        include: [{
          model: FooterLink,
          as: 'links',
          where: { is_active: true },
          order: [['order', 'ASC']]
        }]
      });

      sections.forEach(section => {
        if (section.links && section.links.length > 0) {
          section.links.sort((a, b) => a.order - b.order);
        }
      });

      const connect = await Connect.findOne({
        order: [['updated_at', 'DESC']]
      });

      const socialLinks = connect ? {
        facebook: connect.facebook || null,
        instagram: connect.instagram || null,
        twitter: connect.twitter || null,
        phone_number: connect.phone_number || null,
        email: connect.email || null
      } : { facebook: null, instagram: null, twitter: null, phone_number: null, email: null };

      return {
        success: true,
        data: sections,
        socialLinks
      };
    }, 300);

    res.json(responseData);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch footer sections'
    });
  }
};



module.exports = { getFooterSections }; 