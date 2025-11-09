/**
 * Middleware to verify user authentication and email verification
 * This should be applied to all task routes before the actual handlers
 */

import type { AuthenticatedRequest } from '@/types/auth-request';
import ErrorHandler from '@/utils/errorHandler';
import logger from '@/core/logger';

export const verifyUserAccess = (req: AuthenticatedRequest) => {
  if (!req.user) {
    throw ErrorHandler.AuthError('Authentication required');
  }

  if (!req.user.isVerified) {
    throw ErrorHandler.Forbidden('Email verification required to access tasks');
  }

  logger.info('User access verified', {
    userId: req.user.id,
    email: req.user.email,
    action: 'task_access',
  });
};
