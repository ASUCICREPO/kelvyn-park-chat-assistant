#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { KelvynParkChatAssistantStack } from '../lib/kelvyn-park-chat-assistant-stack';

const app = new cdk.App();

// Retrieve the GitHub token from command line parameters
const githubToken = app.node.tryGetContext('githubToken');

if (!githubToken) {
  throw new Error('GitHub token must be provided. Use -c githubToken=<your-token> when deploying.');
}

new KelvynParkChatAssistantStack(app, 'KelvynParkChatAssistantStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  githubToken: githubToken,
});