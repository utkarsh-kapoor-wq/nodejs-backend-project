import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { eq, and } from 'drizzle-orm';
import { sendMessageToQueue } from '@/core/aws/sqs.service';
import { asyncHandler, Response, validate } from '@/utils/asyncHandler';
import { EmailVerificationSchema, verifyOtpSchema } from '@/utils/validations';
import ErrorHandler from '@/utils/errorHandler';
import { users } from '@/db/schemas/user.schema';
import { db } from '@/db';
import { otpCodes } from '@/db/schemas';

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

  // Check if email exists in the database
  const existingEmail = await db.select().from(users).where(eq(users.email, email));
  if (existingEmail.length === 0) {
    throw ErrorHandler.NotFound('Email not found');
  }

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

export const verifyAccountHandler = asyncHandler(async (req: ExpressRequest, _res: ExpressResponse) => {
  const { email, otp, type } = req.body;
  // Check if email exists in the database
  const existingEmail = await db.select().from(users).where(eq(users.email, email));
  if (existingEmail.length === 0) {
    throw ErrorHandler.NotFound('Email not found');
  }
  // Fetch the user id for the email
  const userId = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .then(res => res[0].id);

  const existingOtp = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.userId, userId), eq(otpCodes.code, otp), eq(otpCodes.type, type)));

  if (existingOtp.length === 0) {
    throw ErrorHandler.BadRequest('Invalid OTP');
  }

  const currentTime = new Date();
  if (existingOtp[0].expiresAt < currentTime) {
    throw ErrorHandler.BadRequest('OTP has expired');
  }

  // If OTP is valid and not expired, proceed to verify the user's account
  await db.update(users).set({ isVerified: true }).where(eq(users.id, userId));

  // Optionally, delete the used OTP
  await db.delete(otpCodes).where(eq(otpCodes.id, existingOtp[0].id));

  return Response.success(null, 'Account verified successfully');
});

export const verifyAccountWithValidation = [validate(data => verifyOtpSchema.parse(data)), verifyAccountHandler];
