/**
 * GitHub OIDC プロキシ CDK コンストラクト
 *
 * 作成するリソース:
 * - API Gateway REST API（4 エンドポイント）
 * - Lambda 関数 × 4（Discovery, Token, UserInfo, JWKS）
 * - IAM ロール（Lambda 用、SSM 読み取り権限）
 */

import { Construct } from 'constructs';
import {
  Duration,
  Fn,
  Stack,
  aws_lambda_nodejs as nodejs,
  aws_lambda as lambda,
  aws_apigateway as apigateway,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface GitHubOidcProxyConstructProps {
  githubClientId: string;
  githubClientSecret: string;
  keyId?: string;
}

export class GitHubOidcProxyConstruct extends Construct {
  public readonly issuerUrl: string;

  constructor(scope: Construct, id: string, props: GitHubOidcProxyConstructProps) {
    super(scope, id);

    const keyId = props.keyId ?? 'github-oidc-proxy-key-1';

    // ★ SSM Parameter Store パラメータ名
    // RSA 鍵ペアはセットアップ手順で手動登録する
    const privateKeyParamName = `/github-oidc-proxy/${id}/private-key`;
    const publicKeyParamName = `/github-oidc-proxy/${id}/public-key`;

    const privateKeyParam = ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'RsaPrivateKey', { parameterName: privateKeyParamName },
    );
    const publicKeyParam = ssm.StringParameter.fromStringParameterName(
      this, 'RsaPublicKey', publicKeyParamName,
    );

    // __dirname equivalent for ESM
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    const handlersDir = path.join(currentDir, 'handlers');

    // ★ API Gateway — Cognito が issuerUrl としてアクセスするエンドポイント
    const api = new apigateway.RestApi(this, 'GitHubOidcProxyApi', {
      restApiName: 'GitHub OIDC Proxy',
      description: 'OIDC proxy for GitHub OAuth 2.0 integration with Cognito',
      deployOptions: { stageName: 'prod' },
    });

    // ★ issuerUrl を restApiId + region から構築（循環依存を回避）
    const region = Stack.of(this).region;
    const issuerUrl = Fn.join('', [
      'https://', api.restApiId, '.execute-api.', region, '.amazonaws.com/prod',
    ]);
    this.issuerUrl = issuerUrl;

    const commonBundling: nodejs.BundlingOptions = {
      format: nodejs.OutputFormat.ESM,
      mainFields: ['module', 'main'],
      sourceMap: true,
    };

    // Discovery Lambda
    const discoveryFn = new nodejs.NodejsFunction(this, 'DiscoveryFunction', {
      entry: path.join(handlersDir, 'discovery.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(5),
      environment: { ISSUER_URL: issuerUrl },
      bundling: commonBundling,
    });

    // Token Proxy Lambda
    const tokenFn = new nodejs.NodejsFunction(this, 'TokenFunction', {
      entry: path.join(handlersDir, 'token.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      environment: {
        ISSUER_URL: issuerUrl,
        GITHUB_CLIENT_ID: props.githubClientId,
        GITHUB_CLIENT_SECRET: props.githubClientSecret,
        SSM_PRIVATE_KEY_NAME: privateKeyParamName,
        KEY_ID: keyId,
      },
      bundling: commonBundling,
    });

    // UserInfo Proxy Lambda
    const userInfoFn = new nodejs.NodejsFunction(this, 'UserInfoFunction', {
      entry: path.join(handlersDir, 'userinfo.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(15),
      environment: { ISSUER_URL: issuerUrl },
      bundling: commonBundling,
    });

    // JWKS Lambda
    const jwksFn = new nodejs.NodejsFunction(this, 'JwksFunction', {
      entry: path.join(handlersDir, 'jwks.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(10),
      environment: {
        SSM_PUBLIC_KEY_NAME: publicKeyParam.parameterName,
        KEY_ID: keyId,
      },
      bundling: commonBundling,
    });

    // ★ IAM: SSM 読み取り権限
    privateKeyParam.grantRead(tokenFn);
    publicKeyParam.grantRead(jwksFn);

    // ★ API Gateway エンドポイント
    const wellKnown = api.root.addResource('.well-known');
    wellKnown.addResource('openid-configuration')
      .addMethod('GET', new apigateway.LambdaIntegration(discoveryFn));

    api.root.addResource('token')
      .addMethod('POST', new apigateway.LambdaIntegration(tokenFn));

    api.root.addResource('userinfo')
      .addMethod('GET', new apigateway.LambdaIntegration(userInfoFn));

    api.root.addResource('jwks')
      .addMethod('GET', new apigateway.LambdaIntegration(jwksFn));
  }
}