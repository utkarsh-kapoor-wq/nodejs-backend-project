/**
 * AWS Configuration Module
 * - Configures AWS SDK v3 clients for SQS and S3
 *
 * @module aws.config
 * @requires @aws-sdk/client-sqs
 * @requires @aws-sdk/client-s3
 * @requires dotenv
 * @exports sqsClient - Configured SQS client
 * @exports s3Client - Configured S3 client
 * @exports AWS_REGION - AWS region used in configuration
 *
 * --- IGNORE ---
 *
 * This file is excluded from code coverage as it primarily deals with
 * configuration and does not contain business logic.
 *
 * --- END IGNORE ---
 */

import { SQSClient } from '@aws-sdk/client-sqs';
import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

// Configure AWS SDK v3 clients
const awsConfig = {
  region: (process.env.AWS_REGION as string) ?? 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
};
// Export region for other services
export const AWS_REGION = awsConfig.region;

// Initialize SQS client
export const sqsClient = new SQSClient(awsConfig);

// Initialize S3 client
export const s3Client = new S3Client(awsConfig);
