/**
 * Beefree SDK auth proxy – calls Beefree loginV2 and returns token for frontend.
 * Keeps client_id and client_secret only on the server.
 */
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse } = require('../../../utils/responseUtils');

const NEWSLETTER_TEMPLATES_DIR = path.join(__dirname, '..', '..', '..', 'newsletterTemplates');

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'template';
}

async function ensureTemplatesDir() {
  await fs.mkdir(NEWSLETTER_TEMPLATES_DIR, { recursive: true });
}

async function getBeeToken(req, res) {
  try {
    const uid = req.body?.uid || 'anonymous';
    const clientId = process.env.BEEFREE_CLIENT_ID;
    const clientSecret = process.env.BEEFREE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(503).json({
        success: false,
        error: 'Beefree is not configured (missing BEEFREE_CLIENT_ID or BEEFREE_CLIENT_SECRET)',
      });
    }

    const response = await fetch('https://auth.getbee.io/loginV2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        uid,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: errText || 'Beefree auth failed',
      });
    }

    const data = await response.json();
    res.json({
      success: true,
      token: data.access_token,
      v2: data.v2,
    });
  } catch (err) {
    console.error('Beefree auth error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get Beefree token',
    });
  }
}

/**
 * Save newsletter template to files under newsletterTemplates/<id>/.
 * Body: { name, subject, designJson, html, id? }
 */
async function saveTemplate(req, res) {
  try {
    const { name, subject, designJson, html, id: existingId } = req.body || {};

    if (!name || typeof subject !== 'string') {
      return errorResponse(res, { statusCode: 400 }, 'name and subject are required', 400);
    }

    const designString =
      designJson == null
        ? '{}'
        : typeof designJson === 'string'
          ? designJson
          : JSON.stringify(designJson);
    const htmlString = html == null ? '' : String(html);

    await ensureTemplatesDir();

    let templateId = existingId;
    if (!templateId || typeof templateId !== 'string' || !/^[a-z0-9-]+$/.test(templateId)) {
      const slug = slugify(name);
      templateId = `${slug}-${uuidv4().slice(0, 8)}`;
    }

    const templateDir = path.join(NEWSLETTER_TEMPLATES_DIR, templateId);
    await fs.mkdir(templateDir, { recursive: true });

    const now = new Date().toISOString();

    // Keep createdAt stable across updates.
    let createdAt = now;
    try {
      const oldMetaRaw = await fs.readFile(path.join(templateDir, 'meta.json'), 'utf8');
      const oldMeta = JSON.parse(oldMetaRaw);
      if (oldMeta?.createdAt) createdAt = oldMeta.createdAt;
    } catch {
      // ignore
    }

    const meta = {
      id: templateId,
      name,
      subject,
      createdAt,
      updatedAt: now,
      updatedBy: req?.user?.id ?? null,
    };

    await fs.writeFile(path.join(templateDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    await fs.writeFile(path.join(templateDir, 'design.json'), designString, 'utf8');
    await fs.writeFile(path.join(templateDir, 'body.html'), htmlString, 'utf8');

    return successResponse(res, { id: templateId, name, subject }, 'Template saved', 200);
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to save template', 500);
  }
}

async function listTemplates(req, res) {
  try {
    await ensureTemplatesDir();
    const entries = await fs.readdir(NEWSLETTER_TEMPLATES_DIR, { withFileTypes: true });
    const templates = [];

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const metaPath = path.join(NEWSLETTER_TEMPLATES_DIR, ent.name, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(raw);
        templates.push({
          id: meta.id || ent.name,
          name: meta.name || ent.name,
          subject: meta.subject || '',
          createdAt: meta.createdAt || null,
          updatedAt: meta.updatedAt || null,
        });
      } catch {
        templates.push({
          id: ent.name,
          name: ent.name,
          subject: '',
          createdAt: null,
          updatedAt: null,
        });
      }
    }

    templates.sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    );

    return successResponse(res, templates, 'Templates listed', 200);
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to list templates', 500);
  }
}

async function getTemplate(req, res) {
  try {
    const { id } = req.params || {};
    if (!id || typeof id !== 'string' || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return errorResponse(res, { statusCode: 400 }, 'Invalid template id', 400);
    }

    const templateDir = path.join(NEWSLETTER_TEMPLATES_DIR, id);
    const [metaRaw, designRaw, htmlRaw] = await Promise.all([
      fs.readFile(path.join(templateDir, 'meta.json'), 'utf8').catch(() => null),
      fs.readFile(path.join(templateDir, 'design.json'), 'utf8').catch(() => null),
      fs.readFile(path.join(templateDir, 'body.html'), 'utf8').catch(() => null),
    ]);

    if (!metaRaw) {
      return errorResponse(res, { statusCode: 404 }, 'Template not found', 404);
    }

    const meta = JSON.parse(metaRaw);

    let parsedDesign = null;
    if (typeof designRaw === 'string') {
      try {
        parsedDesign = JSON.parse(designRaw);
      } catch {
        parsedDesign = designRaw;
      }
    }

    return successResponse(
      res,
      {
        id: meta.id || id,
        name: meta.name,
        subject: meta.subject,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        designJson: parsedDesign,
        html: htmlRaw || '',
      },
      'Template loaded',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to load template', 500);
  }
}

async function deleteTemplate(req, res) {
  try {
    const { id } = req.params || {};
    if (!id || typeof id !== 'string' || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return errorResponse(res, { statusCode: 400 }, 'Invalid template id', 400);
    }

    const templateDir = path.join(NEWSLETTER_TEMPLATES_DIR, id);
    await fs.rm(templateDir, { recursive: true, force: false });

    return successResponse(res, { id }, 'Template deleted', 200);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return errorResponse(res, { statusCode: 404 }, 'Template not found', 404);
    }
    return errorResponse(res, err, err?.message || 'Failed to delete template', 500);
  }
}

module.exports = {
  getBeeToken,
  saveTemplate,
  listTemplates,
  getTemplate,
  deleteTemplate,
};
