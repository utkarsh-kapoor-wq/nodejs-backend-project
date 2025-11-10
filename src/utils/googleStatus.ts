import type { Request } from 'express';
import logger from '@/core/logger';

/**
 * Google connection helper
 *
 * Utility to determine whether the authenticated user has connected a Google
 * account. It reads the `user` object attached to the request (by
 * authentication middleware) and returns a small typed result used by
 * controllers or middleware.
 *
 * @module utils/getGoogleConnectionStatus
 */
export interface GoogleConnectionResult {
  connected: boolean;
  message: string;
  userId?: string;
  email?: string;
}

/**
 * Determine the Google connection status for the current request.
 *
 * @param req - Express Request instance with `user` attached
 * @returns GoogleConnectionResult with connection flag, message and optional user info
 */
export function getGoogleConnectionStatus(req: Request): GoogleConnectionResult {
  const user = (req as unknown as { user?: Record<string, unknown> }).user;

  const { id, email, googleConnected } = user ?? {};

  // Safely cast googleConnected to boolean
  const connected = !!googleConnected;

  // Build the result object
  const result: GoogleConnectionResult = {
    connected,
    message: connected ? 'Task updated in Google Calendar.' : 'Please verify your Google account to sync tasks.',
    userId: typeof id === 'string' ? id : undefined,
    email: typeof email === 'string' ? email : undefined,
  };

  // Log the check result
  try {
    if (connected) {
      logger.info(result.message, {
        googleConnected: true,
        userId: result.userId,
        email: result.email,
      });
    } else {
      logger.warn(result.message, {
        googleConnected: false,
        userId: result.userId,
        email: result.email,
      });
    }
  } catch (err) {
    logger.error('Error logging Google connection status', { err });
  }

  return result;
}

export default getGoogleConnectionStatus;
