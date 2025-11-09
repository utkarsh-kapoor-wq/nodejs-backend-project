import type { Request, Response as ExpressResponse, NextFunction } from 'express';
import ErrorHandler from '@/utils/errorHandler';
import { ErrorType } from '@/types/error';
import logger from '@/core/logger';

type AsyncRouteHandler<T extends Request = Request> = (
  req: T,
  res: ExpressResponse,
  next: NextFunction,
) => Promise<RouteResult<unknown> | void>;

interface RouteResult<T> {
  data?: T;
  message?: string;
  statusCode?: number;
  meta?: Record<string, unknown>;
}

/**
 * Enhanced async handler that provides automatic error handling and response formatting
 * @param handler - The async route handler function
 * @returns Express middleware function with automatic error handling
 */
export function asyncHandler<T extends Request = Request>(handler: AsyncRouteHandler<T>) {
  return async (req: Request, res: ExpressResponse, next: NextFunction): Promise<void> => {
    try {
      const result = await handler(req as T, res, next);

      // If response was already sent, don't interfere
      if (res.headersSent) {
        return;
      }

      // Handle different result types
      if (result !== undefined) {
        handleSuccess(res, result);
      }
    } catch (error) {
      handleError(error, req, next);
    }
  };
}

/**
 * Smart success response handler
 */
function handleSuccess(res: ExpressResponse, result: RouteResult<unknown> | unknown): void {
  // If result is a RouteResult object
  if (result && typeof result === 'object' && ('data' in result || 'message' in result)) {
    const { data, message = 'Success', statusCode = 200, meta } = result as RouteResult<unknown>;

    res.status(statusCode).json({
      success: true,
      message,
      data,
      ...(meta && { meta }),
    });
    return;
  }

  // If result is primitive or plain object, treat as data
  res.status(200).json({
    success: true,
    message: 'Success',
    data: result,
  });
}

/**
 * Smart error handler that converts various error types to ErrorHandler instances
 */
function handleError(error: unknown, req: Request, next: NextFunction): void {
  let handledError: ErrorHandler;

  // If it's already an ErrorHandler, pass it through
  if (error instanceof ErrorHandler) {
    handledError = error;
  }
  // Handle common JavaScript errors
  else if (error instanceof Error) {
    handledError = convertJSErrorToErrorHandler(error);
  }
  // Handle string errors
  else if (typeof error === 'string') {
    handledError = new ErrorHandler(error, 500, ErrorType.INTERNAL_SERVER_ERROR);
  }
  // Handle unknown errors
  else {
    handledError = new ErrorHandler('An unknown error occurred', 500, ErrorType.INTERNAL_SERVER_ERROR, {
      originalError: error,
    });
  }

  // Log the error for debugging
  logger.error('Route error occurred', {
    path: req.path,
    method: req.method,
    error: handledError.message,
    stack: handledError.stack,
    metadata: handledError.metadata,
  });

  next(handledError);
}

/**
 * Convert common JavaScript errors to appropriate ErrorHandler instances
 */
function convertJSErrorToErrorHandler(error: Error): ErrorHandler {
  // Database/Connection errors
  if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
    return ErrorHandler.DatabaseError('Database connection failed', { originalError: error.message });
  }

  // Validation errors (common validation libraries)
  if (error.name === 'ValidationError' || error.message.includes('validation')) {
    return ErrorHandler.ValidationError(error.message);
  }

  // JWT/Auth errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return ErrorHandler.AuthError('Invalid or expired token');
  }

  // Syntax/Type errors (usually development issues)
  if (error.name === 'SyntaxError' || error.name === 'TypeError') {
    return new ErrorHandler('Internal server error', 500, ErrorType.INTERNAL_SERVER_ERROR, {
      originalError: error.message,
    });
  }

  // Default case
  return new ErrorHandler(error.message, 500, ErrorType.INTERNAL_SERVER_ERROR);
}

/**
 * Helper functions for common response patterns
 */
export const Response = {
  /**
   * Success response with data
   */
  success: <T>(data: T, message = 'Success', statusCode = 200): RouteResult<T> => ({
    data,
    message,
    statusCode,
  }),

  /**
   * Created response (201)
   */
  created: <T>(data: T, message = 'Created successfully'): RouteResult<T> => ({
    data,
    message,
    statusCode: 201,
  }),

  /**
   * No content response (204)
   */
  noContent: (message = 'No content'): RouteResult<undefined> => ({
    message,
    statusCode: 204,
  }),

  /**
   * Unauthorized response (401)
   */
  unAuthorized: (message = 'Unauthorized'): RouteResult<undefined> => ({
    message,
    statusCode: 401,
  }),

  /**
   * Success with pagination metadata
   */
  paginated: <T>(data: T[], total: number, page: number, limit: number, message = 'Success'): RouteResult<T[]> => ({
    data,
    message,
    statusCode: 200,
    meta: {
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    },
  }),
};

/**
 * Validation middleware helper
 */
export function validate<T>(validationFn: (data: unknown) => T) {
  return (req: Request, _res: ExpressResponse, next: NextFunction) => {
    try {
      const validated = validationFn(req.body);
      req.body = validated;
      next();
    } catch (error) {
      next(error instanceof Error ? ErrorHandler.ValidationError(error.message) : error);
    }
  };
}
