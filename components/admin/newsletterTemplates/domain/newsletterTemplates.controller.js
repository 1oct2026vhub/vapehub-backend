/**
 * Stripo auth token proxy.
 * Keeps Stripo credentials only on the server.
 */
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { successResponse, errorResponse } = require('../../../../utils/responseUtils');
const { NewsletterGroup, NewsletterGroupUser, User } = require('../../../../models');

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

async function getStripoAuthToken(req, res) {
  try {
    const pluginId = process.env.STRIPO_PLUGIN_ID;
    const secretKey = process.env.STRIPO_SECRET_KEY;
    const resolvedUserId = String(req?.user?.id ?? req?.body?.userId ?? '').trim();
    const resolvedRole = String(req?.body?.role ?? req?.user?.role ?? '').trim();

    if (!pluginId || !secretKey) {
      return errorResponse(
        res,
        { statusCode: 503 },
        'Stripo is not configured (missing STRIPO_PLUGIN_ID or STRIPO_SECRET_KEY)',
        503
      );
    }

    if (!resolvedUserId) {
      return errorResponse(
        res,
        { statusCode: 400 },
        'userId is required for Stripo co-edit token generation',
        400
      );
    }

    const authPayload = {
      pluginId,
      secretKey,
      userId: resolvedUserId,
    };

    if (resolvedRole) {
      authPayload.role = resolvedRole;
    }

    const { data } = await axios.post(
      'https://plugins.stripo.email/api/v1/auth',
      authPayload,
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return successResponse(
      res,
      {
        pluginId,
        token: data?.token || null,
        userId: resolvedUserId,
      },
      'Stripo token generated',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to authenticate Stripo', 500);
  }
}

async function listDefaultTemplates(req, res) {
  try {
    const pluginId = process.env.STRIPO_PLUGIN_ID;
    const secretKey = process.env.STRIPO_SECRET_KEY;
    const resolvedUserId = String(req?.user?.id ?? req?.query?.userId ?? '').trim();
    const resolvedRole = String(req?.query?.role ?? req?.user?.role ?? '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSizeRaw = parseInt(req.query.pageSize, 10);
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
        ? Math.min(pageSizeRaw, 100)
        : 20;

    if (!pluginId || !secretKey) {
      return errorResponse(
        res,
        { statusCode: 503 },
        'Stripo is not configured (missing STRIPO_PLUGIN_ID or STRIPO_SECRET_KEY)',
        503
      );
    }

    if (!resolvedUserId) {
      return errorResponse(res, { statusCode: 400 }, 'userId is required', 400);
    }

    const authPayload = {
      pluginId,
      secretKey,
      userId: resolvedUserId,
    };

    if (resolvedRole) {
      authPayload.role = resolvedRole;
    }

    const { data: authData } = await axios.post(
      'https://plugins.stripo.email/api/v1/auth',
      authPayload,
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const token = authData?.token;
    if (!token) {
      return errorResponse(res, { statusCode: 502 }, 'Failed to obtain Stripo token', 502);
    }

    const { data } = await axios.get('https://plugins.stripo.email/api/v1/templates', {
      timeout: 15000,
      headers: {
        'ES-PLUGIN-AUTH': `Bearer ${token}`,
      },
    });

    const templates = Array.isArray(data)
      ? data
      : Array.isArray(data?.templates)
        ? data.templates
        : [];

    const total = templates.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    const pagedTemplates = templates.slice(start, end);

    return successResponse(
      res,
      pagedTemplates,
      'Default templates fetched',
      200,
      {
        page: safePage,
        pageSize,
        total,
        totalPages,
      }
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to fetch default templates', 500);
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
    // Basic pagination params with sane defaults and limits.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSizeRaw = parseInt(req.query.pageSize, 10);
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
        ? Math.min(pageSizeRaw, 100)
        : 20;

    await ensureTemplatesDir();
    const entries = await fs.readdir(NEWSLETTER_TEMPLATES_DIR, { withFileTypes: true });
    const templates = [];

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const baseDir = path.join(NEWSLETTER_TEMPLATES_DIR, ent.name);
      const metaPath = path.join(baseDir, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(raw);
        const [designRaw, htmlRaw] = await Promise.all([
          fs.readFile(path.join(baseDir, 'design.json'), 'utf8').catch(() => null),
          fs.readFile(path.join(baseDir, 'body.html'), 'utf8').catch(() => null),
        ]);

        let parsedDesign = null;
        if (typeof designRaw === 'string') {
          try {
            parsedDesign = JSON.parse(designRaw);
          } catch {
            parsedDesign = designRaw;
          }
        }

        templates.push({
          id: meta.id || ent.name,
          name: meta.name || ent.name,
          subject: meta.subject || '',
          createdAt: meta.createdAt || null,
          updatedAt: meta.updatedAt || null,
          designJson: parsedDesign,
          html: htmlRaw || '',
        });
      } catch {
        templates.push({
          id: ent.name,
          name: ent.name,
          subject: '',
          createdAt: null,
          updatedAt: null,
          designJson: null,
          html: '',
        });
      }
    }

    templates.sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    );

    const total = templates.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    const pagedTemplates = templates.slice(start, end);

    return successResponse(
      res,
      pagedTemplates,
      'Templates listed',
      200,
      {
        page: safePage,
        pageSize,
        total,
        totalPages,
      }
    );
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

async function createGroup(req, res) {
  try {
    const { name, userIds = [] } = req.body || {};
    if (!name || typeof name !== 'string') {
      return errorResponse(res, { statusCode: 400 }, 'name is required', 400);
    }
    if (!Array.isArray(userIds)) {
      return errorResponse(res, { statusCode: 400 }, 'userIds must be an array', 400);
    }

    const group = await NewsletterGroup.create({ name });
    if (userIds.length) {
      const users = await User.findAll({ where: { id: userIds } });
      await group.addUsers(users);
    }

    const count = await group.countUsers();
    return successResponse(
      res,
      { id: group.id, name: group.name, userCount: count },
      'Group created',
      201
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to create group', 500);
  }
}

async function listGroups(req, res) {
  try {
    const groups = await NewsletterGroup.findAll({
      order: [['updatedAt', 'DESC']],
    });

    const data = await Promise.all(
      groups.map(async (g) => ({
        id: g.id,
        name: g.name,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        userCount: await g.countUsers(),
      }))
    );

    return successResponse(res, data, 'Groups listed', 200);
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to list groups', 500);
  }
}

async function getGroup(req, res) {
  try {
    const { id } = req.params || {};
    const group = await NewsletterGroup.findByPk(id, {
      include: [{ model: User, as: 'users', attributes: ['id', 'email'] }],
    });
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }
    return successResponse(
      res,
      {
        id: group.id,
        name: group.name,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        users: group.users,
      },
      'Group loaded',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to load group', 500);
  }
}

async function updateGroup(req, res) {
  try {
    const { id } = req.params || {};
    const { name, userIds } = req.body || {};

    const group = await NewsletterGroup.findByPk(id);
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }

    if (name != null && typeof name !== 'string') {
      return errorResponse(res, { statusCode: 400 }, 'name must be a string', 400);
    }
    if (userIds != null && !Array.isArray(userIds)) {
      return errorResponse(res, { statusCode: 400 }, 'userIds must be an array', 400);
    }

    if (name) {
      group.name = name;
    }
    await group.save();

    if (Array.isArray(userIds)) {
      const users = await User.findAll({ where: { id: userIds } });
      await group.setUsers(users);
    }

    const users = await group.getUsers({ attributes: ['id', 'email'] });
    return successResponse(
      res,
      { id: group.id, name: group.name, users },
      'Group updated',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to update group', 500);
  }
}

async function deleteGroup(req, res) {
  try {
    const { id } = req.params || {};
    const group = await NewsletterGroup.findByPk(id);
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }
    await group.destroy();
    return successResponse(res, { id }, 'Group deleted', 200);
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to delete group', 500);
  }
}

async function addUsersToGroup(req, res) {
  try {
    const { id } = req.params || {};
    const { userIds = [] } = req.body || {};
    if (!Array.isArray(userIds)) {
      return errorResponse(res, { statusCode: 400 }, 'userIds must be an array', 400);
    }

    const group = await NewsletterGroup.findByPk(id);
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }

    const users = await User.findAll({ where: { id: userIds } });
    await group.addUsers(users);

    const updatedUsers = await group.getUsers({ attributes: ['id', 'email'] });
    return successResponse(
      res,
      { id: group.id, users: updatedUsers },
      'Users added to group',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to add users to group', 500);
  }
}

async function removeUsersFromGroup(req, res) {
  try {
    const { id } = req.params || {};
    const { userIds = [] } = req.body || {};
    if (!Array.isArray(userIds)) {
      return errorResponse(res, { statusCode: 400 }, 'userIds must be an array', 400);
    }

    const group = await NewsletterGroup.findByPk(id);
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }

    const users = await User.findAll({ where: { id: userIds } });
    await group.removeUsers(users);

    const updatedUsers = await group.getUsers({ attributes: ['id', 'email'] });
    return successResponse(
      res,
      { id: group.id, users: updatedUsers },
      'Users removed from group',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to remove users from group', 500);
  }
}

async function listUserGroups(req, res) {
  try {
    const { userId } = req.params || {};
    const user = await User.findByPk(userId, {
      include: [{ model: NewsletterGroup, as: 'newsletterGroups' }],
    });
    if (!user) {
      return errorResponse(res, { statusCode: 404 }, 'User not found', 404);
    }
    return successResponse(res, user.newsletterGroups, 'User groups listed', 200);
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to list user groups', 500);
  }
}

async function listGroupUsers(req, res) {
  try {
    const { id } = req.params || {};
    const group = await NewsletterGroup.findByPk(id, {
      include: [{ model: User, as: 'users', attributes: ['id', 'email'] }],
    });
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }
    return successResponse(
      res,
      { id: group.id, name: group.name, users: group.users },
      'Group users listed',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to list group users', 500);
  }
}

module.exports = {
  getStripoAuthToken,
  listDefaultTemplates,
  saveTemplate,
  listTemplates,
  getTemplate,
  deleteTemplate,
  createGroup,
  listGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  addUsersToGroup,
  removeUsersFromGroup,
  listUserGroups,
  listGroupUsers,
};
