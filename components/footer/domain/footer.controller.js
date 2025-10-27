const { FooterSection, FooterLink, Connect } = require('../../../models');

const getFooterSections = async (req, res) => {
  try {
    const { is_active } = req.query;
    // Build where clause - default to active records only
    const where = { is_active: true }; // Default: only active records
    
    // Allow override to include inactive records if explicitly requested
    if (is_active !== undefined) {
      where.is_active = is_active === 'true';
    }
    
    const sections = await FooterSection.findAll({
      where,
      order: [['order', 'ASC']],
      include: [{
        model: FooterLink,
        as: 'links',
        where: { is_active: true }, // Only include active links
        order: [['order', 'ASC']]
      }]
    });
    
    // Ensure links are properly sorted by order
    sections.forEach(section => {
      if (section.links && section.links.length > 0) {
        section.links.sort((a, b) => a.order - b.order);
      }
    });

    // Fetch latest Connect row for social links
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
    
    res.json({
      success: true,
      data: sections,
      socialLinks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch footer sections'
    });
  }
};



module.exports = { getFooterSections }; 