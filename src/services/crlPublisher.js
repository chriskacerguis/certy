// src/services/crlPublisher.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

function toBool(v) {
  return String(v || '').toLowerCase() === 'true';
}

function cfg() {
  const enabled = toBool(process.env.S3_CRL_ENABLE);
  const bucket = process.env.S3_CRL_BUCKET || '';
  const key = process.env.S3_CRL_KEY || 'crl/intermediate.crl.pem';
  const region = process.env.S3_CRL_REGION || 'us-east-1';
  const endpoint = process.env.S3_CRL_ENDPOINT || ''; // e.g., http://localhost:9000 for MinIO
  const publicUrl = process.env.S3_CRL_PUBLIC_URL || ''; // optional override
  const acl = process.env.S3_CRL_ACL || 'public-read';    // requires bucket ACLs enabled
  const cacheControl = process.env.S3_CRL_CACHE_CONTROL || 'public, max-age=300';
  const forcePathStyle = toBool(process.env.S3_CRL_FORCE_PATH_STYLE); // true for MinIO
  return { enabled, bucket, key, region, endpoint, publicUrl, acl, cacheControl, forcePathStyle };
}

function isEnabled() {
  const c = cfg();
  return c.enabled && !!c.bucket && !!c.key;
}

function s3Client() {
  const c = cfg();
  const conf = { region: c.region };
  if (c.endpoint) {
    conf.endpoint = c.endpoint;
    conf.forcePathStyle = c.forcePathStyle;
  }
  // Credentials: use default provider chain (env, shared config, etc.)
  return new S3Client(conf);
}

function derivePublicUrl() {
  const c = cfg();
  if (c.publicUrl) return c.publicUrl;
  if (c.endpoint) {
    // best-effort for custom endpoints
    const base = c.endpoint.replace(/\/+$/, '');
    return c.forcePathStyle ? `${base}/${c.bucket}/${c.key}` : `${base}/${c.bucket}/${c.key}`;
  }
  // AWS standard hostname style
  if (c.region === 'us-east-1') {
    return `https://${c.bucket}.s3.amazonaws.com/${c.key}`;
  }
  return `https://${c.bucket}.s3.${c.region}.amazonaws.com/${c.key}`;
}

/**
 * Upload a PEM CRL to S3 (makes it public if ACL allows).
 * @param {string|Buffer} crlPem
 * @returns {Promise<{bucket:string,key:string,etag:string,url:string}>}
 */
async function publishCRL(crlPem) {
  const c = cfg();
  if (!isEnabled()) {
    const e = new Error('S3 CRL publishing is not enabled or misconfigured');
    e.status = 400; e.expose = true; throw e;
  }
  const client = s3Client();
  const params = {
    Bucket: c.bucket,
    Key: c.key,
    Body: Buffer.isBuffer(crlPem) ? crlPem : Buffer.from(String(crlPem), 'utf8'),
    ContentType: 'application/x-pem-file',
    CacheControl: c.cacheControl
  };
  if (c.acl) params.ACL = c.acl; // may fail if bucket owner enforced — then remove ACL or adjust bucket policy
  const out = await client.send(new PutObjectCommand(params));
  return { bucket: c.bucket, key: c.key, etag: out.ETag || '', url: derivePublicUrl() };
}

module.exports = {
  isEnabled,
  publishCRL,
  derivePublicUrl
};
