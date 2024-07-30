import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import { Construct } from 'constructs';

export class KelvynParkChatAssistantStack extends cdk.Stack {

  public kb_bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the Bedrock knowledge base
    const kb = new bedrock.KnowledgeBase(this, 'kp-bedrock-knowledgebase', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
      instruction: `Use this knowledge base to answer questions about Kelvyn Park Senior & Junior School.`,
    });

    // Create the S3 bucket to house our data
    this.kb_bucket = new s3.Bucket(this, 'kp-document-bucket', {
      bucketName: 'kp-document-bucket',
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new bedrock.S3DataSource(this, 'kp-document-datasource', {
      bucket: this.kb_bucket,
      knowledgeBase: kb,
      dataSourceName: 'kp-school_docs',
      chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT,
      maxTokens: 500,
      overlapPercentage: 20,
    });

    // WebSocketApi
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'kp-web-socket-api');

    const stage = new apigatewayv2.WebSocketStage(this, 'kp-web-socket-stage', {
      webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });

    const webSocketApiArn = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${stage.stageName}/POST/@connections/*`;

    // get-response-from-bedrock Lambda function
    const getResponseFromBedrockLambda = new lambda.Function(this, 'kp-get-response-from-bedrock', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/get-response-from-bedrock'),
      handler: 'index.lambda_handler',
      environment: {
        URL: stage.url,
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
        'execute-api:ManageConnections'
      ],
      resources: ['*']
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

    const webSockethandlerPolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [webSocketApiArn],
    });

    webSocketHandler.addToRolePolicy(webSockethandlerPolicy);
    getResponseFromBedrockLambda.addToRolePolicy(webSockethandlerPolicy);

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: stage.url,
      description: 'WebSocket URL'
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: kb.knowledgeBaseId,
      description: 'Bedrock Knowledge Base ID'
    });
  }
}
