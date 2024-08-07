import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

interface KelvynParkChatAssistantStackProps extends cdk.StackProps {
  githubToken: string;
}

export class KelvynParkChatAssistantStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: KelvynParkChatAssistantStackProps) {
    super(scope, id, props);

    const stackLogGroup = new logs.LogGroup(this, 'KelvynParkChatAssistantStackLogs', {
      logGroupName: '/aws/kelvynpark/all-services',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const s3LoggingBucket = new s3.Bucket(this, 'S3LoggingBucket', {
      bucketName: 'kp-s3-access-logs',
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Create the Bedrock knowledge base
    const kb = new bedrock.KnowledgeBase(this, 'kp-bedrock-knowledgebase', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
      instruction: 'Use this knowledge base to answer questions about Kelvyn Park Senior & Junior School.',
    });

    // Create the S3 bucket to house our data
    const kb_bucket = new s3.Bucket(this, 'kp-doc-bucket', {
      bucketName: 'kp-doc-bucket',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      serverAccessLogsBucket: s3LoggingBucket,
      serverAccessLogsPrefix: 'kp-bucket-logs/'
    });

    const s3_data_source = new bedrock.S3DataSource(this, 'kp-document-datasource', {
      bucket: kb_bucket,
      knowledgeBase: kb,
      dataSourceName: 'kp-document-datasource',
      chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT,
      maxTokens: 500,
      overlapPercentage: 20,
    });

    // Create the S3 bucket to house the incoming emails
    const email_bucket = new s3.Bucket(this, 'kp-email-bucket', {
      bucketName: 'kp-email-bucket',
      lifecycleRules: [
        {
          id: 'Delete archived emails',
          enabled: true,
          prefix: 'archive/',
          expiration: cdk.Duration.days(7),
        },
        {
          id: 'Delete error emails',
          enabled: true,
          prefix: 'processing_errors/',
          expiration: cdk.Duration.days(7),
        },
        {
          id: 'Delete stale unprocessed emails',
          enabled: true,
          prefix: 'incoming/',
          expiration: cdk.Duration.days(15),
        },
      ],
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      serverAccessLogsBucket: s3LoggingBucket,
      serverAccessLogsPrefix: 'kp-bucket-logs/'
    });

    // email-handler Lambda function
    const emailHandler = new lambda.Function(this, 'kp-email-handler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/email-handler'),
      handler: 'index.lambda_handler',
      memorySize: 1024,
      timeout: cdk.Duration.seconds(900),
      environment: {
        SOURCE_BUCKET_NAME: email_bucket.bucketName,
        DESTINATION_BUCKET_NAME: kb_bucket.bucketName,
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId,
        DATA_SOURCE_ID: s3_data_source.dataSourceId,
        MAX_RETRIES: '3',
        ENABLE_LIFECYCLE_RULE: 'true',  // Set to 'true' or 'false'
      },
    })

    email_bucket.grantReadWrite(emailHandler);
    kb_bucket.grantWrite(emailHandler);

    // Additional permissions for S3 lifecycle management and SES
    emailHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        's3:PutLifecycleConfiguration',
        's3:GetLifecycleConfiguration',
        'bedrock:StartIngestionJob',
      ],
      resources: [
        email_bucket.bucketArn,
        `${email_bucket.bucketArn}/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${kb.knowledgeBaseId}`,
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        `arn:aws:bedrock:${this.region}:${this.account}:agent-runtime/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:*`,
      ],
    }));

    // Create SES Receipt Rule Set
    const sesRuleSet = new ses.ReceiptRuleSet(this, 'kp-email-receipt-rule-set', {
      receiptRuleSetName: 'kp-email-processing-rule-set',
    });

    // Create SES Receipt Rule
    const sesRule = sesRuleSet.addRule('kp-process-incoming-email', {
      recipients: ["asucic.com"], // This will apply to all emails @yourdomain.com
      scanEnabled: true,
      tlsPolicy: ses.TlsPolicy.REQUIRE,
    });

    // Add actions to the rule
    sesRule.addAction(new sesActions.S3({
      bucket: email_bucket,
      objectKeyPrefix: 'incoming/',
    }));

    sesRule.addAction(new sesActions.Lambda({
      function: emailHandler,
    }));

    // Grant SES permission to invoke the Lambda function
    emailHandler.addPermission('AllowSESInvoke', {
      principal: new iam.ServicePrincipal('ses.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceAccount: this.account,
    });

    // WebSocketApi
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'kp-web-socket-api', {
      apiName: 'kp-web-socket-api',
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'kp-web-socket-stage', {
      webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });

    const webSocketApiArn = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${webSocketStage.stageName}/POST/@connections/*`;

    // get-response-from-bedrock Lambda function
    const getResponseFromBedrockLambda = new lambda.Function(this, 'kp-get-response-from-bedrock', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/get-response-from-bedrock'),
      handler: 'index.lambda_handler',
      environment: {
        URL: webSocketStage.callbackUrl,
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId,
      },
      timeout: cdk.Duration.seconds(300),
      memorySize: 256
    });

    getResponseFromBedrockLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock-agent-runtime:Retrieve',
        'bedrock-runtime:InvokeModel',
        'bedrock-runtime:InvokeModelWithResponseStream',
        'bedrock:Retrieve',
        'bedrock:InvokeModelWithResponseStream',
        'execute-api:ManageConnections',
        'execute-api:Invoke'
      ],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${kb.knowledgeBaseId}`,
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        `arn:aws:bedrock:${this.region}:${this.account}:agent-runtime/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:*`,
        webSocketApiArn
      ]
    }));

    // web-socket-handler Lambda function
    const webSocketHandler = new lambda.Function(this, 'kp-web-socket-handler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/web-socket-handler'),
      handler: 'index.lambda_handler',
      environment: {
        RESPONSE_FUNCTION_ARN: getResponseFromBedrockLambda.functionArn
      }
    });

    getResponseFromBedrockLambda.grantInvoke(webSocketHandler);

    const webSocketIntegration = new apigatewayv2_integrations.WebSocketLambdaIntegration('kp-web-socket-integration', webSocketHandler);

    webSocketApi.addRoute('sendMessage',
      {
        integration: webSocketIntegration,
        returnResponse: true
      }
    );

    webSocketHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [webSocketApiArn],
    }));

    // GitHub personal access token stored in Secrets Manager
    const githubToken = new secretsmanager.Secret(this, 'GitHubToken', {
      secretName: 'kp-github-token',
      description: 'GitHub Personal Access Token for Amplify',
      secretStringValue: cdk.SecretValue.unsafePlainText(props.githubToken)
    });

    // Create the Amplify App
    const amplifyApp = new amplify.App(this, 'KelvynParkReactApp', {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'ASUCICREPO',
        repository: 'MultilingualChatbot',
        oauthToken: githubToken.secretValue
      }),
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObjectToYaml({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: [
                'cd frontend',
                'npm ci'
              ]
            },
            build: {
              commands: [
                'npm run build'
              ]
            }
          },
          artifacts: {
            baseDirectory: 'frontend/build',
            files: [
              '**/*'
            ]
          },
          cache: {
            paths: [
              'frontend/node_modules/**/*'
            ]
          }
        }
      }),
    });

    // Add environment variables
    amplifyApp.addEnvironment('REACT_APP_WEBSOCKET_API', webSocketStage.url);

    // Add a branch
    const mainBranch = amplifyApp.addBranch('main', {
      autoBuild: true,
      stage: 'PRODUCTION'
    });

    // Grant Amplify permission to read the secret
    githubToken.grantRead(amplifyApp);

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: webSocketStage.callbackUrl,
      description: 'WebSocket URL'
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: kb.knowledgeBaseId,
      description: 'Bedrock Knowledge Base ID'
    });

    new cdk.CfnOutput(this, 'SESRuleSetName', {
      value: sesRuleSet.receiptRuleSetName!,
      description: 'The name of the SES Receipt Rule Set',
    });

    new cdk.CfnOutput(this, 'GitHubTokenSecretArn', {
      value: githubToken.secretArn,
      description: 'ARN of the gitHub Token Secret',
    });

    new cdk.CfnOutput(this, 'AmplifyAppURL', {
      value: `https://${mainBranch.branchName}.${amplifyApp.defaultDomain}`,
      description: 'Amplify Application URL'
    });

    new cdk.CfnOutput(this, 'LogInsightsQueryLink', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#logsV2:logs-insights$3FqueryDetail$3D~(end~0~start~-3600~timeType~'RELATIVE~unit~'seconds~editorString~'fields*20*40timestamp*2c*20*40message*0a*7c*20sort*20*40timestamp*20desc*0a*7c*20limit*2020~isLiveTail~false~source~(~'*2faws*2fkelvynpark*2fall-services))`,
      description: 'CloudWatch Logs Insights Query Link'
    });
  }
}
