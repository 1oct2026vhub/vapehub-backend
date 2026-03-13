const router = require('express').Router();
const newsletterTemplatesController = require('../domain/newsletterTemplates.controller');
const { authMiddleware } = require('../../../library/middleware');

// POST /api/beefree/auth – returns { success, token, v2 } for BeefreeSDK(token)
router.post('/auth', newsletterTemplatesController.getBeeToken);

// Admin-only newsletter template storage (file-based)
// POST /api/beefree/templates
router.post('/templates', [authMiddleware(true)], newsletterTemplatesController.saveTemplate);

// GET /api/beefree/templates
router.get('/templates', [authMiddleware(true)], newsletterTemplatesController.listTemplates);

// GET /api/beefree/templates/:id
router.get('/templates/:id', [authMiddleware(true)], newsletterTemplatesController.getTemplate);

// DELETE /api/beefree/templates/:id
router.delete('/templates/:id', [authMiddleware(true)], newsletterTemplatesController.deleteTemplate);

module.exports = router;
