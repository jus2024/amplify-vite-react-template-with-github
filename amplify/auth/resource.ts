import { defineAuth, secret } from "@aws-amplify/backend";

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      oidc: [
        {
          name: "GitHub",
          clientId: secret("GITHUB_CLIENT_ID"),
          clientSecret: secret("GITHUB_CLIENT_SECRET"),
          // ★ 手順 4 で取得した API Gateway URL を設定
          issuerUrl: "https://vyzf29a9ki.execute-api.us-west-2.amazonaws.com/prod",
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
        // ★ 手順 4 で生成された Amplify ドメインの URL を設定
        "https://main.dmyossuuu34g0.amplifyapp.com",
      ],
      logoutUrls: [
        "http://localhost:3000/",
        // ★ 手順 4 で生成された Amplify ドメインの URL を設定
        "https://main.dmyossuuu34g0.amplifyapp.com",
      ],
    },
  },
});