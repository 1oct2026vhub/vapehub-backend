/**
 * Newsletter templates in S3: {prefix}/{templateId}/meta.json, design.json, body.html
 */
const s3 = require('../../config/awsConfig');

const FILE_META = 'meta.json';
const FILE_DESIGN = 'design.json';
const FILE_HTML = 'body.html';

function normalizePrefix() {
  const raw = process.env.NEWSLETTER_TEMPLATES_S3_PREFIX || 'newsletter-templates';
  return String(raw).replace(/^\/+|\/+$/g, '');
}

function templatePrefixForId(id) {
  return `${normalizePrefix()}/${id}`;
}

function objectKey(id, filename) {
  return `${templatePrefixForId(id)}/${filename}`;
}

function requireBucket() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    const err = new Error('AWS_S3_BUCKET is not configured');
    err.statusCode = 503;
    throw err;
  }
  return bucket;
}

function isValidTemplateId(id) {
  return Boolean(id && typeof id === 'string' && !id.includes('..') && !id.includes('/') && !id.includes('\\'));
}

function assertValidTemplateId(id) {
  if (!isValidTemplateId(id)) {
    const err = new Error('Invalid template id');
    err.statusCode = 400;
    throw err;
  }
}

async function getObjectUtf8(key) {
  const Bucket = requireBucket();
  try {
    const res = await s3.getObject({ Bucket, Key: key }).promise();
    if (!res.Body) return null;
    return res.Body.toString('utf8');
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.statusCode === 404) return null;
    throw err;
  }
}

async function putObjectUtf8(key, body, contentType) {
  const Bucket = requireBucket();
  await s3
    .upload({
      Bucket,
      Key: key,
      Body: Buffer.from(body, 'utf8'),
      ContentType: contentType,
    })
    .promise();
}

async function deleteObjectBestEffort(key) {
  const Bucket = requireBucket();
  try {
    await s3.deleteObject({ Bucket, Key: key }).promise();
  } catch (err) {
    if (err.code === 'NotFound' || err.statusCode === 404) return;
    throw err;
  }
}

/**
 * @returns {{ metaRaw: string|null, designRaw: string|null, htmlRaw: string|null }}
 */
async function readTemplateFull(id) {
  assertValidTemplateId(id);
  const [metaRaw, designRaw, htmlRaw] = await Promise.all([
    getObjectUtf8(objectKey(id, FILE_META)),
    getObjectUtf8(objectKey(id, FILE_DESIGN)),
    getObjectUtf8(objectKey(id, FILE_HTML)),
  ]);
  return { metaRaw, designRaw, htmlRaw };
}

/**
 * @returns {{ id: string, name: string, subject: string, html: string }}
 */
async function loadNewsletterTemplateById(id) {
  assertValidTemplateId(id);
  const [metaRaw, htmlRaw] = await Promise.all([
    getObjectUtf8(objectKey(id, FILE_META)),
    getObjectUtf8(objectKey(id, FILE_HTML)),
  ]);

  if (!metaRaw) {
    const err = new Error('Template not found');
    err.statusCode = 404;
    throw err;
  }

  const meta = JSON.parse(metaRaw);
  return {
    id: meta.id || id,
    name: meta.name,
    subject: meta.subject,
    html: htmlRaw || '',
  };
}

/**
 * @param {string} id
 * @param {{ metaString: string, designString: string, htmlString: string }} parts
 */
async function writeTemplateParts(id, { metaString, designString, htmlString }) {
  assertValidTemplateId(id);
  await putObjectUtf8(objectKey(id, FILE_DESIGN), designString, 'application/json; charset=utf-8');
  await putObjectUtf8(objectKey(id, FILE_HTML), htmlString, 'text/html; charset=utf-8');
  await putObjectUtf8(objectKey(id, FILE_META), metaString, 'application/json; charset=utf-8');
}

async function readPreviousMetaString(id) {
  assertValidTemplateId(id);
  return getObjectUtf8(objectKey(id, FILE_META));
}

/**
 * @returns {Promise<string[]>}
 */
async function listTemplateIds() {
  requireBucket();
  const prefix = `${normalizePrefix()}/`;
  const ids = [];
  let continuationToken;

  do {
    const res = await s3
      .listObjectsV2({
        Bucket: process.env.AWS_S3_BUCKET,
        Prefix: prefix,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      })
      .promise();

    for (const cp of res.CommonPrefixes || []) {
      const p = cp.Prefix || '';
      const inner = p.slice(prefix.length).replace(/\/+$/, '');
      if (inner && !inner.includes('/')) ids.push(inner);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return ids;
}

async function deleteTemplateAllObjects(id) {
  assertValidTemplateId(id);
  await Promise.all([
    deleteObjectBestEffort(objectKey(id, FILE_META)),
    deleteObjectBestEffort(objectKey(id, FILE_DESIGN)),
    deleteObjectBestEffort(objectKey(id, FILE_HTML)),
  ]);
}

module.exports = {
  isValidTemplateId,
  assertValidTemplateId,
  readTemplateFull,
  readPreviousMetaString,
  writeTemplateParts,
  listTemplateIds,
  deleteTemplateAllObjects,
  loadNewsletterTemplateById,
};
