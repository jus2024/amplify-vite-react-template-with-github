# AWS Amplify + React + Vite テンプレート（GitHub ログイン付き）

[AWS Amplify Gen 2 クイックスタート](https://docs.amplify.aws/react/start/quickstart/) をベースに、**GitHub アカウントによるソーシャルログイン**を追加したテンプレートです。

GitHub は標準の OIDC プロバイダーではないため、API Gateway + Lambda による OIDC プロキシを構築し、Amazon Cognito の外部 OIDC プロバイダーとして連携しています。

## アーキテクチャ

```
ブラウザ
  │
  ├─ Cognito Hosted UI（ログイン画面）
  │     │
  │     ▼
  │  GitHub OAuth 認可画面
  │     │
  │     ▼
  │  Cognito Token Endpoint
  │     │
  │     ▼
  │  API Gateway (OIDC Proxy)
  │     ├─ /.well-known/openid-configuration  → Discovery Lambda
  │     ├─ /token                              → Token Lambda（GitHub トークン交換 + ID トークン生成）
  │     ├─ /userinfo                           → UserInfo Lambda
  │     └─ /jwks                               → JWKS Lambda
  │
  ▼
Amplify アプリ（React + Vite）
```

### 主要コンポーネント

| リソース | 役割 |
|---------|------|
| Amazon Cognito | ユーザープール・認証管理 |
| API Gateway + Lambda × 4 | GitHub OAuth を OIDC に変換するプロキシ |
| SSM Parameter Store | RSA 鍵ペアの保管（ID トークン署名用） |
| AWS AppSync + DynamoDB | Todo データの GraphQL API |

## 機能

- **GitHub ログイン**: Cognito の外部 OIDC プロバイダーとして GitHub を統合
- **メール/パスワード認証**: Cognito 標準のサインアップ/サインインも利用可能
- **GraphQL API**: AppSync による Todo CRUD
- **リアルタイム同期**: DynamoDB + AppSync サブスクリプション

## 前提条件

- Node.js >= 20.20.0 / npm >= 10.8.0
- AWS アカウント
- GitHub OAuth App（[作成手順](https://docs.github.com/ja/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)）
- RSA 鍵ペア（ID トークン署名用）

## セットアップ手順

### 1. リポジトリのクローンとデプロイ

このリポジトリを GitHub にフォークし、[Amplify コンソール](https://console.aws.amazon.com/amplify/) から接続してデプロイします。

詳細は [Amplify Gen 2 クイックスタート](https://docs.amplify.aws/react/start/quickstart/) を参照してください。

### 2. GitHub OAuth App の作成

[GitHub Developer Settings](https://github.com/settings/developers) で OAuth App を作成します。

- **Homepage URL**: Amplify アプリの URL（例: `https://main.xxxxx.amplifyapp.com`）
- **Authorization callback URL**: Cognito のコールバック URL
  - 形式: `https://<cognito-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`

### 3. RSA 鍵ペアの生成と登録

ID トークンの署名に使用する RSA 鍵ペアを生成し、SSM Parameter Store に登録します。

```bash
# 鍵ペアの生成（JWK 形式）
node -e "
const { generateKeyPairSync } = require('crypto');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
console.log('=== Private Key (JWK) ===');
console.log(JSON.stringify(privateKey.export({ format: 'jwk' })));
console.log('=== Public Key (JWK) ===');
console.log(JSON.stringify(publicKey.export({ format: 'jwk' })));
"

# SSM に登録（SecureString / String）
aws ssm put-parameter \
  --name "/github-oidc-proxy/GitHubOidcProxy/private-key" \
  --type SecureString \
  --value '<秘密鍵 JWK JSON>'

aws ssm put-parameter \
  --name "/github-oidc-proxy/GitHubOidcProxy/public-key" \
  --type String \
  --value '<公開鍵 JWK JSON>'
```

### 4. Amplify シークレットの設定

Amplify コンソールまたは CLI でシークレットを設定します。

```bash
npx ampx sandbox secret set GITHUB_CLIENT_ID
npx ampx sandbox secret set GITHUB_CLIENT_SECRET
```

本番環境（ブランチデプロイ）の場合は Amplify コンソールの「シークレット管理」から設定してください。

### 5. auth/resource.ts の設定

デプロイ後に生成される API Gateway の URL を `issuerUrl` に設定し、Amplify アプリの URL を `callbackUrls` / `logoutUrls` に追加します。

```typescript
export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      oidc: [
        {
          name: "GitHub",
          clientId: secret("GITHUB_CLIENT_ID"),
          clientSecret: secret("GITHUB_CLIENT_SECRET"),
          issuerUrl: "https://<api-id>.execute-api.<region>.amazonaws.com/prod",
          scopes: ["openid", "read:user", "user:email"],
          attributeMapping: {
            email: "email",
            preferredUsername: "preferred_username",
            profilePicture: "picture",
          },
        },
      ],
      callbackUrls: [
        "http://localhost:3000/",
        "https://main.xxxxx.amplifyapp.com",
      ],
      logoutUrls: [
        "http://localhost:3000/",
        "https://main.xxxxx.amplifyapp.com",
      ],
    },
  },
});
```

### 6. 再デプロイ

設定変更をコミット・プッシュすると Amplify が自動デプロイします。

## ローカル開発

```bash
npm install
npx ampx sandbox        # バックエンドのサンドボックス起動
npm run dev             # フロントエンド開発サーバー起動
```

## プロジェクト構成

```
├── amplify/
│   ├── auth/resource.ts                  # Cognito 認証設定
│   ├── data/resource.ts                  # AppSync + DynamoDB スキーマ
│   ├── backend.ts                        # バックエンド定義
│   └── custom-resources/
│       └── github-oidc-proxy/
│           ├── construct.ts              # CDK コンストラクト
│           └── handlers/
│               ├── discovery.ts          # OIDC Discovery エンドポイント
│               ├── token.ts             # トークン交換 + ID トークン生成
│               ├── userinfo.ts          # UserInfo エンドポイント
│               ├── jwks.ts              # JWKS エンドポイント
│               └── utils/
│                   ├── github-api.ts    # GitHub API クライアント
│                   └── jwt.ts           # JWT 署名ユーティリティ
├── src/
│   ├── App.tsx                           # メインアプリ（GitHub ログインボタン付き）
│   └── main.tsx                          # Amplify 初期化
└── package.json
```

## 既知の注意点

- **初回ログイン時のタイムアウト**: Lambda Cold Start により、Cognito のタイムアウト（固定値）を超える場合があります。Token Lambda のメモリを 1024MB に設定することで緩和しています。
- **Cognito ドメイン**: `externalProviders` を設定すると Cognito ドメインが自動作成されます。初回デプロイ時に `externalProviders` がない場合はドメインが作成されません。

## ライセンス

MIT-0 License. [LICENSE](LICENSE) ファイルを参照してください。
