#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { KelvynParkChatAssistantStack } from '../lib/kelvyn-park-chat-assistant-stack';

const app = new cdk.App();
new KelvynParkChatAssistantStack(app, 'KelvynParkChatAssistantStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});