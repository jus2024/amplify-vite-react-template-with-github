import { defineBackend, secret } from '@aws-amplify/backend';
import { CDKContextKey } from '@aws-amplify/platform-core';
import { Construct } from 'constructs';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { GitHubOidcProxyConstruct } from './custom-resources/github-oidc-proxy/construct';

const backend = defineBackend({
  auth,
  data,
});

// GitHub OIDC プロキシの CDK コンストラクトを追加
const githubProxyStack = backend.createStack('GitHubOidcProxyStack');

const githubBackendIdentifier = {
  namespace: githubProxyStack.node.getContext(CDKContextKey.BACKEND_NAMESPACE) as string,
  name: githubProxyStack.node.getContext(CDKContextKey.BACKEND_NAME) as string,
  type: githubProxyStack.node.getContext(CDKContextKey.DEPLOYMENT_TYPE) as 'sandbox' | 'branch',
};

const githubClientIdSecret = secret('GITHUB_CLIENT_ID');
const githubClientSecretSecret = secret('GITHUB_CLIENT_SECRET');

new GitHubOidcProxyConstruct(githubProxyStack as unknown as Construct, 'GitHubOidcProxy', {
  githubClientId: githubClientIdSecret.resolve(githubProxyStack, githubBackendIdentifier).unsafeUnwrap(),
  githubClientSecret: githubClientSecretSecret.resolve(githubProxyStack, githubBackendIdentifier).unsafeUnwrap(),
});