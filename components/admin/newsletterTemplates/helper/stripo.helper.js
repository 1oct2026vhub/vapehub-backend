const axios = require('axios');

const STRIPO_AUTH_URL = 'https://plugins.stripo.email/api/v1/auth';
const STRIPO_TEMPLATES_BASE_URL = 'https://my.stripo.email/bapi/plugin-templates/v1/templates';
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 25 * 60 * 1000;

const tokenCache = new Map();

function getCacheKey(pluginId, userId, role) {
  return `${pluginId}:${userId}:${role}`;
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function resolveExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  if (payload?.exp && Number.isFinite(Number(payload.exp))) {
    return Number(payload.exp) * 1000;
  }
  return Date.now() + DEFAULT_TOKEN_TTL_MS;
}

function getProviderErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    (typeof error?.response?.data === 'string' ? error.response.data : null)
  );
}

async function requestStripoAccessToken({ pluginId, secretKey, userId, role }) {
  const { data } = await axios.post(
    STRIPO_AUTH_URL,
    { pluginId, secretKey, userId, role },
    {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  return data?.token || null;
}

async function getStripoAccessToken({ pluginId, secretKey, userId, role = 'USER', forceRefresh = false }) {
  const cacheKey = getCacheKey(pluginId, userId, role);
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);

  if (!forceRefresh && cached?.token && cached?.expiresAt && cached.expiresAt - TOKEN_REFRESH_BUFFER_MS > now) {
    return cached.token;
  }

  const token = await requestStripoAccessToken({ pluginId, secretKey, userId, role });
  if (!token) return null;

  tokenCache.set(cacheKey, {
    token,
    expiresAt: resolveExpiryMs(token),
  });

  return token;
}

async function fetchDefaultTemplates({
  token,
  type,
  sort,
  limit,
  page,
  templateTypes,
  templateSeasons,
  templateFeatures,
  templateIndustries,
}) {
  const { data } = await axios.get(STRIPO_TEMPLATES_BASE_URL, {
    timeout: 15000,
    headers: {
      'ES-PLUGIN-AUTH': `Bearer ${token}`,
    },
    params: {
      type,
      sort,
      limit,
      page,
      templateTypes,
      templateSeasons,
      templateFeatures,
      templateIndustries,
    },
  });
  return data;
}

async function fetchDefaultTemplateDetail({ token, templateId }) {
  const { data } = await axios.get(`${STRIPO_TEMPLATES_BASE_URL}/${templateId}`, {
    timeout: 15000,
    headers: {
      'ES-PLUGIN-AUTH': `Bearer ${token}`,
    },
  });
  return data;
}

async function fetchTemplateMetadata({ token, endpoint }) {
  const { data } = await axios.get(`${STRIPO_TEMPLATES_BASE_URL}/${endpoint}`, {
    timeout: 15000,
    headers: {
      'ES-PLUGIN-AUTH': `Bearer ${token}`,
    },
  });
  return data;
}

async function fetchDefaultTemplateTypes({ token }) {
  return fetchTemplateMetadata({ token, endpoint: 'types' });
}

async function fetchDefaultTemplateSeasons({ token }) {
  return fetchTemplateMetadata({ token, endpoint: 'seasons' });
}

async function fetchDefaultTemplateFeatures({ token }) {
  return fetchTemplateMetadata({ token, endpoint: 'features' });
}

async function fetchDefaultTemplateIndustries({ token }) {
  return fetchTemplateMetadata({ token, endpoint: 'industries' });
}

module.exports = {
  getStripoAccessToken,
  fetchDefaultTemplates,
  fetchDefaultTemplateDetail,
  fetchDefaultTemplateTypes,
  fetchDefaultTemplateSeasons,
  fetchDefaultTemplateFeatures,
  fetchDefaultTemplateIndustries,
  getProviderErrorMessage,
};
