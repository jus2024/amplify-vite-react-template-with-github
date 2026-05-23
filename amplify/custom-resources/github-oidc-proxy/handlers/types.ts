/**
 * GitHub OIDC プロキシ - 型定義
 */

// GitHub Users API レスポンス（GET /user）
export interface GitHubUserResponse {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

// GitHub User Emails API レスポンスの各要素（GET /user/emails）
export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

// GitHub トークンエンドポイントレスポンス
export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

// ID トークン（JWT）ペイロード — Cognito に返却する OIDC 準拠トークン
export interface IdTokenPayload {
  sub: string;       // GitHub ユーザー ID（文字列化）
  iss: string;       // プロキシの API Gateway URL
  aud: string;       // GitHub の client_id
  exp: number;       // 有効期限（UNIX タイムスタンプ）
  iat: number;       // 発行時刻
  email?: string;    // GitHub のプライマリメール（取得失敗時はフォールバック）
  preferred_username?: string;  // GitHub ログイン名
  name?: string;     // 表示名
  picture?: string;  // アバター URL
}

// OIDC Discovery メタデータ
export interface OidcDiscoveryMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  claims_supported: string[];
}

// JWKS レスポンス
export interface JwkKey {
  kty: 'RSA';
  kid: string;
  use: 'sig';
  alg: 'RS256';
  n: string;
  e: string;
}

export interface JwksResponse {
  keys: JwkKey[];
}