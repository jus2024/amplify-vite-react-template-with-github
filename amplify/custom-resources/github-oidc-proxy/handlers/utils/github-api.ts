import type {
  GitHubTokenResponse,
  GitHubUserResponse,
  GitHubEmail,
} from '../types.js';

const GITHUB_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const GITHUB_USERS_ENDPOINT = 'https://api.github.com/user';
const GITHUB_USER_EMAILS_ENDPOINT = 'https://api.github.com/user/emails';
const REQUEST_TIMEOUT_MS = 10_000;
// GitHub API は User-Agent ヘッダーが必須
const USER_AGENT = 'github-oidc-proxy';

/**
 * 認可コードを GitHub トークンエンドポイントに送信してアクセストークンを取得する。
 * ポイント: GitHub は Basic 認証ではなく POST ボディでクライアント認証を行う。
 */
export async function exchangeToken(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<GitHubTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GITHUB_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Accept: application/json を指定しないと form-urlencoded で返ってくる
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `GitHub token endpoint returned HTTP ${response.status}: ${errorBody}`,
      );
    }

    return (await response.json()) as GitHubTokenResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** GitHub Users API からユーザー情報を取得する */
export async function fetchUserInfo(
  accessToken: string,
): Promise<GitHubUserResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GITHUB_USERS_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `GitHub Users API returned HTTP ${response.status}: ${errorBody}`,
      );
    }

    return (await response.json()) as GitHubUserResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** GitHub User Emails API からメールアドレス一覧を取得する */
export async function fetchUserEmails(
  accessToken: string,
): Promise<GitHubEmail[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GITHUB_USER_EMAILS_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `GitHub User Emails API returned HTTP ${response.status}: ${errorBody}`,
      );
    }

    return (await response.json()) as GitHubEmail[];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * メールアドレス一覧から最適なメールを選択する。
 * 優先順位: primary+verified > verified > フォールバック({login}@github-user.local)
 */
export function selectPrimaryEmail(emails: GitHubEmail[], login: string): string {
  const primaryVerified = emails.find(
    (e) => e.primary === true && e.verified === true,
  );
  if (primaryVerified) return primaryVerified.email;

  const verified = emails.find((e) => e.verified === true);
  if (verified) return verified.email;

  return `${login}@github-user.local`;
}