const { FooterSection, FooterLink } = require('../../../../models');
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');

class FooterController {
  

  // Admin: Get all sections
  async getFooterSectionsAdmin(req, res) {
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
  }

  // Create new section
  async createFooterSection(req, res) {
    try {
      const { order } = req.body;
      
      // If order is specified, shift other sections
      if (order !== undefined) {
        await FooterSection.sequelize.transaction(async (t) => {
          // Shift sections with order >= new order up by 1
          await FooterSection.update(
            { order: Sequelize.literal('`order` + 1') },
            {
              where: {
                order: {
                  [Op.gte]: order
                }
              },
              transaction: t
            }
          );
        });
      }

      const updated_by = req.user?.id ?? null;
      const createData = { ...req.body };
      if (updated_by != null) createData.updated_by = updated_by;
      const section = await FooterSection.create(createData);
      res.status(201).json({
        success: true,
        data: section
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to create footer section'
      });
    }
  }

  // Update section
  async updateFooterSection(req, res) {
    try {
      const section = await FooterSection.findByPk(req.params.id);
      if (!section) {
        return res.status(404).json({
          success: false,
          error: 'Footer section not found'
        });
      }
      const updateData = { ...req.body };
      const updated_by = req.user?.id ?? null;
      if (updated_by != null) updateData.updated_by = updated_by;
      const updatedSection = await section.update(updateData);
      res.json({
        success: true,
        data: updatedSection
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to update footer section'
      });
    }
  }

  // Delete section
  async deleteFooterSection(req, res) {
    try {
      const section = await FooterSection.findByPk(req.params.id);
      if (!section) {
        return res.status(404).json({
          success: false,
          error: 'Footer section not found'
        });
      }
      const updated_by = req.user?.id ?? null;
      if (updated_by != null) await section.update({ updated_by });
      await section.destroy();
      res.json({
        success: true,
        message: 'Footer section deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete footer section'
      });
    }
  }

  // Get links by section ID
  async getFooterLinks(req, res) {
    try {
      const { section_id, is_active } = req.query;
      
      // Build where clause
      const where = {};
      if (section_id) {
        where.section_id = section_id;
      }
      
      // Add active status filter if provided
      if (is_active !== undefined) {
        where.is_active = is_active === 'true';
      }
      
      const links = await FooterLink.findAll({
        where,
        order: [['order', 'ASC']]
      });
      res.json({
        success: true,
        data: links
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch footer links'
      });
    }
  }

  // Create new link
  async createFooterLink(req, res) {
    try {
      const { order, section_id } = req.body;
      
      // If order is specified, shift other links in the same section
      if (order !== undefined) {
        await FooterLink.sequelize.transaction(async (t) => {
          // Shift links with order >= new order up by 1 in the same section
          await FooterLink.update(
            { order: Sequelize.literal('`order` + 1') },
            {
              where: {
                section_id,
                order: {
                  [Op.gte]: order
                }
              },
              transaction: t
            }
          );
        });
      }

      const updated_by = req.user?.id ?? null;
      const createData = { ...req.body };
      if (updated_by != null) createData.updated_by = updated_by;
      const link = await FooterLink.create(createData);
      res.status(201).json({
        success: true,
        data: link
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to create footer link'
      });
    }
  }

  // Update link
  async updateFooterLink(req, res) {
    try {
      const link = await FooterLink.findByPk(req.params.id);
      if (!link) {
        return res.status(404).json({
          success: false,
          error: 'Footer link not found'
        });
      }
      const updateData = { ...req.body };
      const updated_by = req.user?.id ?? null;
      if (updated_by != null) updateData.updated_by = updated_by;
      const updatedLink = await link.update(updateData);
      res.json({
        success: true,
        data: updatedLink
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to update footer link'
      });
    }
  }

  // Delete link
  async deleteFooterLink(req, res) {
    try {
      const link = await FooterLink.findByPk(req.params.id);
      if (!link) {
        return res.status(404).json({
          success: false,
          error: 'Footer link not found'
        });
      }
      const updated_by = req.user?.id ?? null;
      if (updated_by != null) await link.update({ updated_by });
      await link.destroy();
      res.json({
        success: true,
        message: 'Footer link deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to delete footer link'
      });
    }
  }

  // Reorder section
  async reorderFooterSection(req, res) {
    try {
      const { id } = req.params;
      const { new_order } = req.body;

      const section = await FooterSection.findByPk(id);
      if (!section) {
        return res.status(404).json({
          success: false,
          error: 'Footer section not found'
        });
      }

      await FooterSection.sequelize.transaction(async (t) => {
        if (section.order < new_order) {
          // Moving down: Decrease order of items between old and new position
          await FooterSection.update(
            { order: Sequelize.literal('`order` - 1') },
            {
              where: {
                order: {
                  [Op.gt]: section.order,
                  [Op.lte]: new_order
                }
              },
              transaction: t
            }
          );
        } else if (section.order > new_order) {
          // Moving up: Increase order of items between new and old position
          await FooterSection.update(
            { order: Sequelize.literal('`order` + 1') },
            {
              where: {
                order: {
                  [Op.gte]: new_order,
                  [Op.lt]: section.order
                }
              },
              transaction: t
            }
          );
        }

        // Update current section's order
        const orderPayload = { order: new_order };
        if (req.user?.id != null) orderPayload.updated_by = req.user.id;
        await section.update(orderPayload, { transaction: t });
      });

      // Get updated sections list
      const updatedSections = await FooterSection.findAll({
        order: [['order', 'ASC']],
        include: [{
          model: FooterLink,
          as: 'links',
          order: [['order', 'ASC']]
        }]
      });

      res.json({
        success: true,
        data: updatedSections,
        message: 'Section order updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to reorder footer section'
      });
    }
  }

  // Reorder link
  async reorderFooterLink(req, res) {
    try {
      const { id } = req.params;
      const { new_order } = req.body;

      const link = await FooterLink.findByPk(id);
      if (!link) {
        return res.status(404).json({
          success: false,
          error: 'Footer link not found'
        });
      }

      await FooterLink.sequelize.transaction(async (t) => {
        if (link.order < new_order) {
          // Moving down: Decrease order of items between old and new position
          await FooterLink.update(
            { order: Sequelize.literal('`order` - 1') },
            {
              where: {
                section_id: link.section_id,
                order: {
                  [Op.gt]: link.order,
                  [Op.lte]: new_order
                }
              },
              transaction: t
            }
          );
        } else if (link.order > new_order) {
          // Moving up: Increase order of items between new and old position
          await FooterLink.update(
            { order: Sequelize.literal('`order` + 1') },
            {
              where: {
                section_id: link.section_id,
                order: {
                  [Op.gte]: new_order,
                  [Op.lt]: link.order
                }
              },
              transaction: t
            }
          );
        }

        // Update current link's order
        const orderPayload = { order: new_order };
        if (req.user?.id != null) orderPayload.updated_by = req.user.id;
        await link.update(orderPayload, { transaction: t });
      });

      // Get updated links list for the section
      const updatedLinks = await FooterLink.findAll({
        where: { section_id: link.section_id },
        order: [['order', 'ASC']]
      });

      res.json({
        success: true,
        data: updatedLinks,
        message: 'Link order updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to reorder footer link'
      });
    }
  }
}

module.exports = new FooterController(); 