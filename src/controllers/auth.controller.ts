/**
 * Authentication Controller
 *
 * Handles user signup and login functionalities.
 * Utilizes asyncHandler for error handling and response formatting.
 * Implements input validation using Zod schemas.
 * Interacts with the database using Drizzle ORM.
 *
 * Design Pattern Used:
 *  - Controller Pattern: Encapsulates auth logic in a dedicated controller.
 *  - Middleware Pattern: Uses asyncHandler for cleaner async route handling.
 *  - Validation Pattern: Centralized input validation with Zod schemas.
 *
 * @module controllers/auth.controller
 * @requires express
 * @requires drizzle-orm
 * @requires @/db
 * @requires @/db/schemas
 * @requires @/utils/asyncHandler
 * @requires @/utils/errorHandler
 * @requires @/utils/validations
 * @requires @/utils/hashing
 * @exports signupHandler - Handler for user signup
 * @exports loginHandler - Handler for user login
 *
 */

import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schemas';
import { asyncHandler, Response, validate } from '@/utils/asyncHandler';
import ErrorHandler from '@/utils/errorHandler';
import { LoginSchema, SignupSchema } from '@/utils/validations';
import { comparePasswords, hashPassword } from '@/utils/helpers';
import { generateJWTandSetCookie } from '@/utils/jwt_session';
import logger from '@/core/logger';
import type { AuthenticatedRequest } from '@/types/auth-request';
import { env } from '@/env';

/**
 * Signup Handler
 * - Validates input
 * - Checks for existing username/email
 * - Hashes password
 * - Creates new user in DB
 * - Returns created user details (excluding password)
 *
 * Utilizes asyncHandler for automatic error handling and response formatting.
 * Input is validated using the SignupSchema.
 * Interacts with the database via Drizzle ORM.
 * @returns Created user details without password
 * @throws ConflictError if username or email already exists
 * @throws InternalServerError for any other failures
 * @exports signupHandler
 */
export const signupHandler = asyncHandler(async (req: ExpressRequest, _res: ExpressResponse) => {
  const { username, email, password } = req.body;

  try {
    // Check for existing email
    const existingEmailCheck = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingEmailCheck.length > 0) {
      throw ErrorHandler.Conflict('Email already in use');
    }

    // Check for existing username
    const existingUsernameCheck = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUsernameCheck.length > 0) {
      throw ErrorHandler.Conflict('Username already in use');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user - PostgreSQL will auto-generate UUID
    const [createdUser] = await db
      .insert(users)
      .values({ username, email, password: hashedPassword, role: 'user', isVerified: false, googleConnected: false })
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
      });

    logger.info('User created successfully', {
      userId: createdUser.id,
      email: createdUser.email,
      username: createdUser.username,
    });

    return Response.created(createdUser, 'User created successfully');
  } catch (error) {
    logger.error('Signup error:', {
      email,
      username,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ErrorHandler) {
      throw error;
    }

    // Handle database-specific errors
    if (error && typeof error === 'object') {
      const dbError = error as { code?: string; constraint?: string };

      // PostgreSQL unique constraint violation
      if (dbError.code === '23505') {
        if (dbError.constraint?.includes('email')) {
          throw ErrorHandler.Conflict('Email already in use');
        }
        if (dbError.constraint?.includes('username')) {
          throw ErrorHandler.Conflict('Username already in use');
        }
      }
    }

    throw ErrorHandler.InternalServerError('Failed to create user account');
  }
});

/**
 * Signup Handler with Validation Middleware
 * - Combines input validation and signup logic
 * - Validates request body against SignupSchema
 * - Proceeds to signupHandler if validation passes
 * @exports signupHandlerWithValidation
 * @returns Created user details without password
 * @throws ValidationError if input validation fails
 * @throws ConflictError if username or email already exists
 * @throws InternalServerError for any other failures
 */
export const signupHandlerWithValidation = [validate(data => SignupSchema.parse(data)), signupHandler];

// TODO: Implement login logic with proper validation, error handling, and response formatting
/**
 * Login Handler
 * - Placeholder for user login functionality
 * - To be implemented with input validation, authentication, and response formatting
 * @exports loginHandler
 */
// Fix line 108 in your auth.controller.ts
export const loginHandler = asyncHandler(async (req: ExpressRequest, res: ExpressResponse) => {
  const { email, password } = req.body;

  // FIX: Select specific columns instead of all columns
  const userExists = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      password: users.password,
      role: users.role,
      profilePictureUrl: users.profilePictureUrl,
      isVerified: users.isVerified,
      googleConnected: users.googleConnected,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.email, email));

  if (!userExists.length) {
    throw ErrorHandler.AuthError('Invalid email');
  }

  // password verification
  const ispass = await comparePasswords(password, userExists[0].password);
  if (!ispass) {
    throw ErrorHandler.AuthError('Invalid password');
  }

  // created cookie with jwt and return user after login
  const { password: _p, ...userSafe } = userExists[0];
  const token = generateJWTandSetCookie(res, String(userExists[0].id));

  return Response.success({ token, user: userSafe }, 'Login successful');
});

/**
 * Login Handler with Validation Middleware
 * - Validates request body against LoginSchema
 * - Calls loginHandler
 *
 * @exports LoginHandlerWithValidation
 */
export const loginHandlerWithValidation = [validate(data => LoginSchema.parse(data)), loginHandler];

export const logoutHandler = asyncHandler(async (req: AuthenticatedRequest, res: ExpressResponse) => {
  try {
    // Get user info from request (should be set by auth middleware)
    const user = req.user;

    // If no user in request, it means auth middleware didn't set it (no valid token)
    if (!user) {
      logger.warn('Logout attempt without valid authentication', {
        path: req.path,
        timestamp: new Date().toISOString(),
      });

      // Use the Response.unAuthorized helper from asyncHandler
      return Response.unAuthorized('No active session to logout');
    }

    logger.info('User logout initiated', {
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    });

    // Clear the JWT cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    logger.info('User logged out successfully', {
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    });

    return Response.success(null, 'Logged out successfully');
  } catch (error) {
    logger.error('Logout error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Even if there's an error, we should still clear the cookie
    res.clearCookie('token');

    // If it's an auth-related error, return 401
    if (error instanceof ErrorHandler && error.statusCode === 401) {
      return Response.unAuthorized('Invalid or expired token');
    }

    throw error; // Re-throw other errors to be handled by asyncHandler
  }
});
