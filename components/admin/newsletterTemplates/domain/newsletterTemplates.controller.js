/**
 * Stripo auth token proxy.
 * Keeps Stripo credentials only on the server.
 */
const { v4: uuidv4 } = require('uuid');
const { successResponse, errorResponse } = require('../../../../utils/responseUtils');
const { NewsletterGroup, MailSubscription } = require('../../../../models');
const {
  getStripoAccessToken,
  fetchDefaultTemplates,
  fetchDefaultTemplateDetail,
  fetchDefaultTemplateTypes,
  fetchDefaultTemplateSeasons,
  fetchDefaultTemplateFeatures,
  fetchDefaultTemplateIndustries,
  getProviderErrorMessage,
} = require('../helper/stripo.helper');
const newsletterTemplateStorage = require('../../../../library/newsletterTemplates/newsletterTemplateStorage');

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'template';
}

function parseIntegerQueryArray(value) {
  if (value == null || value === '') return undefined;

  const rawValues = Array.isArray(value) ? value : String(value).split(',');
  const parsedValues = rawValues
    .map((item) => Number.parseInt(String(item).trim(), 10))
    .filter((num) => Number.isInteger(num) && num > 0);

  return parsedValues.length > 0 ? parsedValues : undefined;
}

async function getStripoAuthToken(req, res) {
  try {
    const pluginId = process.env.STRIPO_PLUGIN_ID;
    const secretKey = process.env.STRIPO_SECRET_KEY;
    const resolvedUserId = String(req?.user?.id ?? req?.body?.userId ?? '').trim();
    const resolvedRole = String(req?.body?.role ?? req?.user?.role ?? 'USER').trim().toUpperCase();

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
    const token = await getStripoAccessToken({
      pluginId,
      secretKey,
      userId: resolvedUserId,
      role: resolvedRole,
    });

    return successResponse(
      res,
      {
        pluginId,
        token: token || null,
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
    const resolvedRole = String(req?.query?.role ?? req?.user?.role ?? 'USER').trim().toUpperCase();
    const templateType = String(req?.query?.type ?? 'FREE').toUpperCase();
    const allowedTypes = ['BASIC', 'FREE', 'PREMIUM'];
    const allowedRoles = ['USER', 'ADMIN', 'API'];
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSizeRaw = parseInt(req.query.pageSize, 10);
    const pageSize =
      Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
        ? Math.min(pageSizeRaw, 50)
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

    if (!allowedTypes.includes(templateType)) {
      return errorResponse(res, { statusCode: 400 }, 'type must be BASIC, FREE, or PREMIUM', 400);
    }

    if (!allowedRoles.includes(resolvedRole)) {
      return errorResponse(res, { statusCode: 400 }, 'role must be USER, ADMIN, or API', 400);
    }

    const token = await getStripoAccessToken({
      pluginId,
      secretKey,
      userId: resolvedUserId,
      role: resolvedRole,
    });
    if (!token) {
      return errorResponse(res, { statusCode: 502 }, 'Failed to obtain Stripo token', 502);
    }

    // API uses 1-based paging while Stripo expects 0-based page index.
    const stripoPage = Math.max(0, page - 1);
    const templateTypes = parseIntegerQueryArray(req.query.templateTypes);
    const templateSeasons = parseIntegerQueryArray(req.query.templateSeasons);
    const templateFeatures = parseIntegerQueryArray(req.query.templateFeatures);
    const templateIndustries = parseIntegerQueryArray(req.query.templateIndustries);

    const data = await fetchDefaultTemplates({
      token,
      type: templateType,
      sort: String(req?.query?.sort ?? 'ACTUAL').toUpperCase(),
      limit: pageSize,
      page: stripoPage,
      templateTypes,
      templateSeasons,
      templateFeatures,
      templateIndustries,
    });

    const templates = Array.isArray(data?.data) ? data.data : [];
    const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : templates.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
    const safePage = Math.min(page, totalPages);

    return successResponse(
      res,
      templates,
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
    const providerError = getProviderErrorMessage(err);

    return errorResponse(
      res,
      err,
      providerError || err?.message || 'Failed to fetch default templates',
      err?.response?.status || 500
    );
  }
}

async function getDefaultTemplateDetail(req, res) {
  try {
    const pluginId = process.env.STRIPO_PLUGIN_ID;
    const secretKey = process.env.STRIPO_SECRET_KEY;
    const resolvedUserId = String(req?.user?.id ?? req?.query?.userId ?? '').trim();
    const resolvedRole = String(req?.query?.role ?? req?.user?.role ?? 'USER').trim().toUpperCase();
    const allowedRoles = ['USER', 'ADMIN', 'API'];
    const templateId = Number.parseInt(req?.params?.templateId, 10);

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

    if (!allowedRoles.includes(resolvedRole)) {
      return errorResponse(res, { statusCode: 400 }, 'role must be USER, ADMIN, or API', 400);
    }

    if (!Number.isInteger(templateId) || templateId <= 0) {
      return errorResponse(res, { statusCode: 400 }, 'templateId must be a positive integer', 400);
    }

    const token = await getStripoAccessToken({
      pluginId,
      secretKey,
      userId: resolvedUserId,
      role: resolvedRole,
    });
    if (!token) {
      return errorResponse(res, { statusCode: 502 }, 'Failed to obtain Stripo token', 502);
    }

    const data = await fetchDefaultTemplateDetail({ token, templateId });

    return successResponse(res, data, 'Default template detail fetched', 200);
  } catch (err) {
    const providerError = getProviderErrorMessage(err);

    return errorResponse(
      res,
      err,
      providerError || err?.message || 'Failed to fetch default template detail',
      err?.response?.status || 500
    );
  }
}

async function listDefaultTemplateMetadata(req, res, metadataFetcher, successMessage) {
  try {
    const pluginId = process.env.STRIPO_PLUGIN_ID;
    const secretKey = process.env.STRIPO_SECRET_KEY;
    const resolvedUserId = String(req?.user?.id ?? req?.query?.userId ?? '').trim();
    const resolvedRole = String(req?.query?.role ?? req?.user?.role ?? 'USER').trim().toUpperCase();
    const allowedRoles = ['USER', 'ADMIN', 'API'];

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

    if (!allowedRoles.includes(resolvedRole)) {
      return errorResponse(res, { statusCode: 400 }, 'role must be USER, ADMIN, or API', 400);
    }

    const token = await getStripoAccessToken({
      pluginId,
      secretKey,
      userId: resolvedUserId,
      role: resolvedRole,
    });
    if (!token) {
      return errorResponse(res, { statusCode: 502 }, 'Failed to obtain Stripo token', 502);
    }

    const data = await metadataFetcher({ token });
    const items = Array.isArray(data) ? data : [];

    return successResponse(res, items, successMessage, 200);
  } catch (err) {
    const providerError = getProviderErrorMessage(err);
    return errorResponse(
      res,
      err,
      providerError || err?.message || 'Failed to fetch default template metadata',
      err?.response?.status || 500
    );
  }
}

async function listDefaultTemplateTypes(req, res) {
  return listDefaultTemplateMetadata(
    req,
    res,
    fetchDefaultTemplateTypes,
    'Default template types fetched'
  );
}

async function listDefaultTemplateSeasons(req, res) {
  return listDefaultTemplateMetadata(
    req,
    res,
    fetchDefaultTemplateSeasons,
    'Default template seasons fetched'
  );
}

async function listDefaultTemplateFeatures(req, res) {
  return listDefaultTemplateMetadata(
    req,
    res,
    fetchDefaultTemplateFeatures,
    'Default template features fetched'
  );
}

async function listDefaultTemplateIndustries(req, res) {
  return listDefaultTemplateMetadata(
    req,
    res,
    fetchDefaultTemplateIndustries,
    'Default template industries fetched'
  );
}

/**
 * Save newsletter template to S3 under {NEWSLETTER_TEMPLATES_S3_PREFIX}/<id>/.
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

    let templateId = existingId;
    if (!templateId || typeof templateId !== 'string' || !/^[a-z0-9-]+$/.test(templateId)) {
      const slug = slugify(name);
      templateId = `${slug}-${uuidv4().slice(0, 8)}`;
    }

    const now = new Date().toISOString();

    let createdAt = now;
    try {
      const oldMetaRaw = await newsletterTemplateStorage.readPreviousMetaString(templateId);
      if (oldMetaRaw) {
        const oldMeta = JSON.parse(oldMetaRaw);
        if (oldMeta?.createdAt) createdAt = oldMeta.createdAt;
      }
    } catch {
      // ignore corrupt meta
    }

    const meta = {
      id: templateId,
      name,
      subject,
      createdAt,
      updatedAt: now,
      updatedBy: req?.user?.id ?? null,
    };

    await newsletterTemplateStorage.writeTemplateParts(templateId, {
      metaString: JSON.stringify(meta, null, 2),
      designString,
      htmlString,
    });

    return successResponse(res, { id: templateId, name, subject }, 'Template saved', 200);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status === 503) {
      return errorResponse(res, err, err?.message || 'Storage is not configured', 503);
    }
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

    const templateIds = await newsletterTemplateStorage.listTemplateIds();
    const templates = [];

    for (const templateId of templateIds) {
      try {
        const { metaRaw, designRaw, htmlRaw } = await newsletterTemplateStorage.readTemplateFull(templateId);
        if (!metaRaw) continue;
        const meta = JSON.parse(metaRaw);

        let parsedDesign = null;
        if (typeof designRaw === 'string') {
          try {
            parsedDesign = JSON.parse(designRaw);
          } catch {
            parsedDesign = designRaw;
          }
        }

        templates.push({
          id: meta.id || templateId,
          name: meta.name || templateId,
          subject: meta.subject || '',
          createdAt: meta.createdAt || null,
          updatedAt: meta.updatedAt || null,
          designJson: parsedDesign,
          html: htmlRaw || '',
        });
      } catch {
        templates.push({
          id: templateId,
          name: templateId,
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
    const status = err.statusCode || 500;
    if (status === 503) {
      return errorResponse(res, err, err?.message || 'Storage is not configured', 503);
    }
    return errorResponse(res, err, err?.message || 'Failed to list templates', 500);
  }
}

async function getTemplate(req, res) {
  try {
    const { id } = req.params || {};
    if (!id || typeof id !== 'string' || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return errorResponse(res, { statusCode: 400 }, 'Invalid template id', 400);
    }

    const { metaRaw, designRaw, htmlRaw } = await newsletterTemplateStorage.readTemplateFull(id);

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
    const status = err.statusCode || 500;
    if (status === 503) {
      return errorResponse(res, err, err?.message || 'Storage is not configured', 503);
    }
    return errorResponse(res, err, err?.message || 'Failed to load template', 500);
  }
}

async function deleteTemplate(req, res) {
  try {
    const { id } = req.params || {};
    if (!id || typeof id !== 'string' || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return errorResponse(res, { statusCode: 400 }, 'Invalid template id', 400);
    }

    const { metaRaw } = await newsletterTemplateStorage.readTemplateFull(id);
    if (!metaRaw) {
      return errorResponse(res, { statusCode: 404 }, 'Template not found', 404);
    }

    await newsletterTemplateStorage.deleteTemplateAllObjects(id);

    return successResponse(res, { id }, 'Template deleted', 200);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status === 503) {
      return errorResponse(res, err, err?.message || 'Storage is not configured', 503);
    }
    return errorResponse(res, err, err?.message || 'Failed to delete template', 500);
  }
}

async function createGroup(req, res) {
  try {
    const { name, subscriberIds = [] } = req.body || {};
    if (!name || typeof name !== 'string') {
      return errorResponse(res, { statusCode: 400 }, 'name is required', 400);
    }
    if (!Array.isArray(subscriberIds)) {
      return errorResponse(res, { statusCode: 400 }, 'subscriberIds must be an array', 400);
    }

    const group = await NewsletterGroup.create({ name });
    if (subscriberIds.length) {
      const subscribers = await MailSubscription.findAll({ where: { id: subscriberIds } });
      await group.addSubscribers(subscribers);
    }

    const count = await group.countSubscribers();
    return successResponse(
      res,
      { id: group.id, name: group.name, subscriberCount: count },
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
        subscriberCount: await g.countSubscribers(),
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
      include: [{ model: MailSubscription, as: 'subscribers', attributes: ['id', 'email', 'subscribed'] }],
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
        subscribers: group.subscribers,
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
    const { name, subscriberIds } = req.body || {};

    const group = await NewsletterGroup.findByPk(id);
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }

    if (name != null && typeof name !== 'string') {
      return errorResponse(res, { statusCode: 400 }, 'name must be a string', 400);
    }
    if (subscriberIds != null && !Array.isArray(subscriberIds)) {
      return errorResponse(res, { statusCode: 400 }, 'subscriberIds must be an array', 400);
    }

    if (name) {
      group.name = name;
    }
    await group.save();

    if (Array.isArray(subscriberIds)) {
      const subscribers = await MailSubscription.findAll({ where: { id: subscriberIds } });
      await group.setSubscribers(subscribers);
    }

    const subscribers = await group.getSubscribers({ attributes: ['id', 'email', 'subscribed'] });
    return successResponse(
      res,
      { id: group.id, name: group.name, subscribers },
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
    const { subscriberIds = [] } = req.body || {};
    if (!Array.isArray(subscriberIds)) {
      return errorResponse(res, { statusCode: 400 }, 'subscriberIds must be an array', 400);
    }

    const group = await NewsletterGroup.findByPk(id);
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }

    const subscribers = await MailSubscription.findAll({ where: { id: subscriberIds } });
    await group.addSubscribers(subscribers);

    const updatedSubscribers = await group.getSubscribers({ attributes: ['id', 'email', 'subscribed'] });
    return successResponse(
      res,
      { id: group.id, subscribers: updatedSubscribers },
      'Subscribers added to group',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to add subscribers to group', 500);
  }
}

async function removeUsersFromGroup(req, res) {
  try {
    const { id } = req.params || {};
    const { subscriberIds = [] } = req.body || {};
    if (!Array.isArray(subscriberIds)) {
      return errorResponse(res, { statusCode: 400 }, 'subscriberIds must be an array', 400);
    }

    const group = await NewsletterGroup.findByPk(id);
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }

    const subscribers = await MailSubscription.findAll({ where: { id: subscriberIds } });
    await group.removeSubscribers(subscribers);

    const updatedSubscribers = await group.getSubscribers({ attributes: ['id', 'email', 'subscribed'] });
    return successResponse(
      res,
      { id: group.id, subscribers: updatedSubscribers },
      'Subscribers removed from group',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to remove subscribers from group', 500);
  }
}

async function listUserGroups(req, res) {
  try {
    const { subscriberId } = req.params || {};
    const subscriber = await MailSubscription.findByPk(subscriberId, {
      include: [{ model: NewsletterGroup, as: 'newsletterGroups' }],
    });
    if (!subscriber) {
      return errorResponse(res, { statusCode: 404 }, 'Subscriber not found', 404);
    }
    return successResponse(res, subscriber.newsletterGroups, 'Subscriber groups listed', 200);
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to list subscriber groups', 500);
  }
}

async function listGroupUsers(req, res) {
  try {
    const { id } = req.params || {};
    const group = await NewsletterGroup.findByPk(id, {
      include: [{ model: MailSubscription, as: 'subscribers', attributes: ['id', 'email', 'subscribed'] }],
    });
    if (!group) {
      return errorResponse(res, { statusCode: 404 }, 'Group not found', 404);
    }
    return successResponse(
      res,
      { id: group.id, name: group.name, subscribers: group.subscribers },
      'Group subscribers listed',
      200
    );
  } catch (err) {
    return errorResponse(res, err, err?.message || 'Failed to list group subscribers', 500);
  }
}

module.exports = {
  getStripoAuthToken,
  listDefaultTemplates,
  getDefaultTemplateDetail,
  listDefaultTemplateTypes,
  listDefaultTemplateSeasons,
  listDefaultTemplateFeatures,
  listDefaultTemplateIndustries,
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
