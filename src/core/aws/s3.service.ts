/**
 * AWS S3 Service
 * - Uploads log files to specified S3 bucket
 *
 * @module s3.service
 * @requires fs
 * @requires dotenv
 * @requires @aws-sdk/client-s3
 * @requires @/core/logger
 * @requires @/core/aws/aws.config
 * @exports uploadLogToS3 - Function to upload log files to S3 bucket
 *
 * --- IGNORE ---
 *
 * This file is excluded from code coverage as it primarily deals with
 * configuration and does not contain business logic.
 *
 * --- END IGNORE ---
 */

import fs from 'fs';
import dotenv from 'dotenv';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import logger from '../logger';
import { s3Client } from './aws.config';

dotenv.config();

const BUCKET_NAME = process.env.AWS_S3_LOG_BUCKET_NAME as string;

/**
 * Upload log file to S3 bucket
 */
export const uploadLogToS3 = async (filePath: string) => {
  try {
    const fileName = filePath.split('/').pop();
    const fileContent = fs.readFileSync(filePath);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName!,
      Body: fileContent,
    });

    await s3Client.send(command);

    logger.info(`[S3] Log file uploaded: ${fileName} to bucket: ${BUCKET_NAME}`);
  } catch (error) {
    logger.error(`[S3] Failed to upload log file: ${filePath} to bucket: ${BUCKET_NAME}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error(
      `Failed to upload log file to S3 bucket ${BUCKET_NAME}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
};
