import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { env } from '@/env';
import { db } from '@/db';
import { users } from '@/db/schemas';
import ErrorHandler from '@/utils/errorHandler';

/**
 * Parse token from Authorization header or cookie named 'token'
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  const cookieHeader = req.headers.cookie;
  if (cookieHeader && typeof cookieHeader === 'string') {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const tokenCookie = cookies.find(c => c.startsWith('token='));
    if (tokenCookie) {
      return decodeURIComponent(tokenCookie.split('=')[1]);
    }
  }

  return null;
}

/**
 * Authentication middleware
 * - take token from authorization header or cookie named 'token'
 * - verifies JWT and attaches user object to req.user
 */
// src/middlewares/auth.middleware.ts
export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    return next(ErrorHandler.AuthError('Authentication required'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET_KEY as string) as { userId?: string };

    if (!payload?.userId) {
      return next(ErrorHandler.AuthError('Invalid token payload'));
    }

    // Select specific columns to avoid UUID conversion issues
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        profilePictureUrl: users.profilePictureUrl,
        isVerified: users.isVerified,
        googleConnected: users.googleConnected,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      return next(ErrorHandler.AuthError('Invalid token: user not found'));
    }

    // Attach user to request
    (req as Request & { user?: Record<string, unknown> }).user = user;

    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(ErrorHandler.AuthError('Invalid token'));
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(ErrorHandler.AuthError('Token expired'));
    }
    return next(ErrorHandler.AuthError('Authentication failed'));
  }
}
