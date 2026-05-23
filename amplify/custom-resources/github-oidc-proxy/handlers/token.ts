import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { IdTokenPayload } from './types.js';
import {
  exchangeToken,
  fetchUserInfo,
  fetchUserEmails,
  selectPrimaryEmail,
} from './utils/github-api.js';
import { generateIdToken } from './utils/jwt.js';

const ssmClient = new SSMClient({});

function parseFormBody(body: string | null): Record<string, string> {
  if (!body) return {};
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const issuerUrl = process.env.ISSUER_URL ?? '';
  const githubClientId = process.env.GITHUB_CLIENT_ID ?? '';
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? '';
  const ssmPrivateKeyName = process.env.SSM_PRIVATE_KEY_NAME ?? '';
  const keyId = process.env.KEY_ID ?? '';

  // 1. Cognito からの form-urlencoded リクエストをパース
  const body = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf-8')
    : event.body ?? '';
  const params = parseFormBody(body);

  const code = params['code'];
  const redirectUri = params['redirect_uri'];
  const clientId = params['client_id'] || githubClientId;
  const clientSecret = params['client_secret'] || githubClientSecret;

  if (!code || !redirectUri) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_request', error_description: 'Missing code or redirect_uri' }),
    };
  }

  // 2. GitHub にトークン交換（PKCE 不要なので code_verifier なし）
  const tokenResponse = await exchangeToken(code, redirectUri, clientId, clientSecret);
  const accessToken = tokenResponse.access_token;

  // 3. GitHub Users API からユーザー情報取得
  const userInfo = await fetchUserInfo(accessToken);

  // 4. GitHub User Emails API からメールアドレス取得
  //    ★ X プロキシとの違い: GitHub は実メールを取得可能
  let email: string;
  try {
    const emails = await fetchUserEmails(accessToken);
    email = selectPrimaryEmail(emails, userInfo.login);
  } catch {
    // メール取得失敗時はフォールバック（Cognito の email 必須制約を満たすため）
    email = `${userInfo.login}@github-user.local`;
  }

  // 5. SSM から RSA 秘密鍵を取得（ID トークン署名用）
  const ssmResponse = await ssmClient.send(
    new GetParameterCommand({ Name: ssmPrivateKeyName, WithDecryption: true }),
  );
  const privateKeyJwk = JSON.parse(ssmResponse.Parameter?.Value ?? '') as JsonWebKey;

  // 6. ID トークン生成（RS256 署名）
  //    ★ GitHub は ID トークンを返さないため、プロキシ側で生成する
  const now = Math.floor(Date.now() / 1000);
  const idTokenPayload: IdTokenPayload = {
    sub: String(userInfo.id),
    iss: issuerUrl,
    aud: clientId,
    exp: now + 3600,
    iat: now,
    email,
    preferred_username: userInfo.login,
    name: userInfo.name ?? undefined,
    picture: userInfo.avatar_url,
  };

  const idToken = await generateIdToken(idTokenPayload, privateKeyJwk, keyId);

  // 7. Cognito に OIDC トークンレスポンスを返却
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      token_type: 'bearer',
      id_token: idToken,
      scope: tokenResponse.scope || 'read:user,user:email',
    }),
  };
};