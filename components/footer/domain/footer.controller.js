const { FooterSection, FooterLink } = require('../../../models');

const getFooterSections = async (req, res) => {
  try {
    const { is_active } = req.query;
    // Build where clause for filtering by active status if provided
    const where = {};
    if (is_active !== undefined) {
      where.is_active = is_active === 'true';
    }
    
    const sections = await FooterSection.findAll({
      where,
      order: [['order', 'ASC']],
      include: [{
        model: FooterLink,
        as: 'links',
        order: [['order', 'ASC']]
      }]
    });
    
    // Ensure links are properly sorted by order
    sections.forEach(section => {
      if (section.links && section.links.length > 0) {
        section.links.sort((a, b) => a.order - b.order);
      }
    });
    
    res.json({
      success: true,
      data: sections
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch footer sections'
    });
  }
};



module.exports = { getFooterSections }; 