import { SQSClient } from '@aws-sdk/client-sqs';
import { env } from '@/env';

// Configure AWS SDK v3 clients
const awsConfig = {
  region: (env.AWS_REGION as string) ?? 'ap-south-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY as string,
  },
};
// Export region for other services
export const AWS_REGION = awsConfig.region;

// Initialize SQS client
export const sqsClient = new SQSClient(awsConfig);
