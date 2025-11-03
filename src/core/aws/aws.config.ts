// src/config/aws.config.ts
import AWS from 'aws-sdk';
import { env } from '@/env';

AWS.config.update({
  region: (env.AWS_REGION as string) ?? 'ap-south-1',
});

export const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
export const ses = new AWS.SES({ apiVersion: '2010-12-01' });
