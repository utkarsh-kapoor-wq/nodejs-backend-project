import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { sendMessageToQueue } from '@/core/aws/sqs.service';
import { asyncHandler, Response, validate } from '@/utils/asyncHandler';
import { EmailVerificationSchema } from '@/utils/validations';

/**
 * Verify Account Handler
 * - Sends a verification OTP to the user's email via SQS
 *
 * Utilizes asyncHandler for automatic error handling and response formatting.
 * Interacts with AWS SQS to enqueue the OTP sending request.
 * @returns Success message indicating OTP has been sent
 * @throws InternalServerError for any failures in sending the message
 * @exports verifyAccountHandler
 */
export const sendVerificationEmail = asyncHandler(async (req: ExpressRequest, _res: ExpressResponse) => {
  const { email, type } = req.body;
  // Send message to SQS to trigger OTP email
  await sendMessageToQueue('OTP_QUEUE', { email, type });
  // Respond with success message
  return Response.success(null, 'Verification OTP sent successfully');
});

/**
 * Verify Account with Validation Middleware
 * - Validates request body against EmailVerificationSchema
 * - Calls verifyAccount handler
 *
 * @exports verifyAccountWithValidation
 */
export const sendVerificationEmailWithValidation = [
  validate(data => EmailVerificationSchema.parse(data)),
  sendVerificationEmail,
];
