import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { OidcDiscoveryMetadata } from './types.js';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const issuerUrl = process.env.ISSUER_URL ?? '';

  const metadata: OidcDiscoveryMetadata = {
    issuer: issuerUrl,
    // ★ ポイント: GitHub の認可 URL を直接指定（Authorize Proxy 不要）
    // X プロキシではプロキシ自身の /authorize を指定していたが、
    // GitHub は PKCE 不要 & state 長さ制限なしのため直接リダイレクト可能
    authorization_endpoint: 'https://github.com/login/oauth/authorize',
    token_endpoint: `${issuerUrl}/token`,
    userinfo_endpoint: `${issuerUrl}/userinfo`,
    jwks_uri: `${issuerUrl}/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'read:user', 'user:email'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    claims_supported: [
      'sub', 'iss', 'aud', 'exp', 'iat',
      'preferred_username', 'name', 'picture', 'email',
    ],
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  };
};