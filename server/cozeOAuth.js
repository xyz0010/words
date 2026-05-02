import crypto from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';

let cachedPrivateKey = null;
let cachedAccessToken = '';
let cachedAccessTokenExpiresAt = 0;

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function resolveCozeBaseUrl(env = process.env) {
  return (env.COZE_BASE_URL || 'https://api.coze.cn').trim();
}

function resolveJwtAudience(env = process.env) {
  const explicitAudience = (env.COZE_OAUTH_AUDIENCE || '').trim();
  if (explicitAudience) return explicitAudience;

  try {
    return new URL(resolveCozeBaseUrl(env)).host;
  } catch {
    return 'api.coze.cn';
  }
}

async function loadPrivateKey(env = process.env) {
  if (cachedPrivateKey) return cachedPrivateKey;

  const inlineKey = (env.COZE_OAUTH_PRIVATE_KEY || '').trim();
  if (inlineKey) {
    cachedPrivateKey = inlineKey.replace(/\\n/g, '\n');
    return cachedPrivateKey;
  }

  const keyPath = (env.COZE_OAUTH_PRIVATE_KEY_PATH || '').trim();
  if (keyPath) {
    const resolvedPath = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
    cachedPrivateKey = await readFile(resolvedPath, 'utf8');
    return cachedPrivateKey;
  }

  return '';
}

export function isCozeOAuthConfigured(env = process.env) {
  return Boolean(
    (env.COZE_OAUTH_CLIENT_ID || '').trim() &&
    (env.COZE_OAUTH_KID || '').trim() &&
    ((env.COZE_OAUTH_PRIVATE_KEY || '').trim() || (env.COZE_OAUTH_PRIVATE_KEY_PATH || '').trim())
  );
}

async function signCozeJwt(env = process.env) {
  const clientId = (env.COZE_OAUTH_CLIENT_ID || '').trim();
  const kid = (env.COZE_OAUTH_KID || '').trim();
  const privateKey = await loadPrivateKey(env);
  const aud = resolveJwtAudience(env);

  if (!clientId || !kid || !privateKey) {
    throw new Error('coze_oauth_env_missing');
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 300;
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid,
  };
  const payload = {
    iss: clientId,
    aud,
    iat: now,
    exp: expiresAt,
    jti: crypto.randomUUID(),
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey, 'base64');
  const encodedSignature = signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${signingInput}.${encodedSignature}`;
}

async function requestNewAccessToken(env = process.env) {
  const jwt = await signCozeJwt(env);
  const baseUrl = resolveCozeBaseUrl(env);
  const tokenUrl = `${baseUrl}/api/permission/oauth2/token`;
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(
    86399,
    Math.max(900, Number(env.COZE_OAUTH_TOKEN_TTL || 3600))
  );

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      duration_seconds: ttl,
    }),
  });

  const data = await response.json().catch(() => ({}));
  const accessToken = typeof data?.access_token === 'string' ? data.access_token.trim() : '';
  const expiresIn = Number(data?.expires_in || 0);

  if (!response.ok || !accessToken) {
    throw new Error(`coze_oauth_token_failed:${response.status}`);
  }

  cachedAccessToken = accessToken;
  cachedAccessTokenExpiresAt = now + (expiresIn > 0 ? expiresIn : ttl);
  return accessToken;
}

export async function getCozeAccessToken(options = {}) {
  const { env = process.env, forceRefresh = false } = options;
  const now = Math.floor(Date.now() / 1000);

  if (
    !forceRefresh &&
    cachedAccessToken &&
    cachedAccessTokenExpiresAt - 60 > now
  ) {
    return cachedAccessToken;
  }

  return requestNewAccessToken(env);
}

export async function resolveCozeAuthHeader({ env = process.env, devToken = '' } = {}) {
  const manualToken = String(devToken || '').trim();
  if (manualToken) {
    return { token: manualToken, source: 'dev_token' };
  }

  if (isCozeOAuthConfigured(env)) {
    const token = await getCozeAccessToken({ env });
    return { token, source: 'coze_oauth' };
  }

  const patToken = (env.COZE_TOKEN || '').trim();
  if (patToken) {
    return { token: patToken, source: 'coze_pat' };
  }

  return { token: '', source: 'env_missing' };
}
