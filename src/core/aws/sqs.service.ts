import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { env } from '@/env';
import logger from '../logger';
import { sqsClient } from './aws.config';

type QueueName = 'OTP_QUEUE';

const QUEUE_URLS: Record<QueueName, string> = {
  OTP_QUEUE: env.AWS_SQS_OTP_QUEUE_URL as string,
  // AI_REPORT_QUEUE: env.AWS_SQS_AI_REPORT_QUEUE_URL,
};

/**
 * Send message to SQS queue
 */
export const sendMessageToQueue = async (queue: QueueName, messageBody: Record<string, string | number | boolean>) => {
  try {
    const queueUrl = QUEUE_URLS[queue];
    if (!queueUrl) {
      throw new Error(`Queue URL not found for queue: ${queue}`);
    }

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        MessageType: {
          StringValue: queue,
          DataType: 'String',
        },
        Timestamp: {
          StringValue: new Date().toISOString(),
          DataType: 'String',
        },
      },
    });

    const response = await sqsClient.send(command);

    logger.info(`[SQS] Message sent to ${queue}:`, {
      messageId: response.MessageId,
      queue,
      messageBody: JSON.stringify(messageBody),
    });

    return {
      success: true,
      messageId: response.MessageId,
      queue,
    };
  } catch (error) {
    logger.error(`[SQS] Failed to send message to ${queue}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      queue,
      messageBody: JSON.stringify(messageBody),
    });
    throw new Error(
      `Failed to send message to queue ${queue}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};
