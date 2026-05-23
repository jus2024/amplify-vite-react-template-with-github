import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { GitHubUserResponse } from './types.js';
import { fetchUserInfo, fetchUserEmails, selectPrimaryEmail } from './utils/github-api.js';

function extractBearerToken(
  headers: Record<string, string | undefined> | null,
): string | null {
  if (!headers) return null;
  // API Gateway がヘッダー名を小文字に正規化する場合があるため case-insensitive で検索
  const authKey = Object.keys(headers).find(
    (key) => key.toLowerCase() === 'authorization',
  );
  if (!authKey) return null;
  const match = headers[authKey]?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const accessToken = extractBearerToken(event.headers);

  if (!accessToken) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_token', error_description: 'Missing Authorization header' }),
    };
  }

  // GitHub Users API からユーザー情報を取得
  const ghUser: GitHubUserResponse = await fetchUserInfo(accessToken);

  // GitHub User Emails API からメールアドレスを取得
  let email: string;
  try {
    const emails = await fetchUserEmails(accessToken);
    email = selectPrimaryEmail(emails, ghUser.login);
  } catch {
    email = `${ghUser.login}@github-user.local`;
  }

  // ★ OIDC UserInfo 形式に変換して返却
  // Cognito はこのレスポンスを attributeMapping に従ってユーザー属性にマッピングする
  const userInfo: Record<string, string | undefined> = {
    sub: String(ghUser.id),
    preferred_username: ghUser.login,
    email,
  };

  if (ghUser.name !== null && ghUser.name !== undefined) {
    userInfo.name = ghUser.name;
  }
  if (ghUser.avatar_url) {
    userInfo.picture = ghUser.avatar_url;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userInfo),
  };
};