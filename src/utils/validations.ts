import { z } from 'zod';

/**
 * User-related validation schemas
 */
export const SignupSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Task-related validation schemas
 */
export const CreateTaskSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(255, 'Title must not exceed 255 characters').trim(),
    description: z.string().max(2000, 'Description must not exceed 2000 characters').optional().nullable(),
    status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).default('pending'),
    startTime: z.iso.datetime('Invalid start time format').optional().nullable(),
    endTime: z.iso.datetime('Invalid end time format').optional().nullable(),
    calendarEventId: z.string().max(255, 'Calendar event ID too long').optional().nullable(),
  })
  .refine(
    data => {
      if (data.startTime && data.endTime) {
        return new Date(data.startTime) < new Date(data.endTime);
      }
      return true;
    },
    {
      message: 'Start time must be before end time',
      path: ['startTime'],
    },
  );

/**
 * Update Task Schema
 * - All fields are optional for partial updates
 */
export const UpdateTaskSchema = CreateTaskSchema.partial();

/**
 * Task Query Parameters Schema
 * - For validating query parameters in task listing endpoints
 */
export const TaskQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  search: z.string().min(1).max(100).optional(),
  sortBy: z.enum(['title', 'createdAt', 'updatedAt', 'startTime']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
});

/**
 * Task Params Schema
 * - For validating route parameters like task ID
 */
export const TaskParamsSchema = z.object({
  id: z.uuid('Invalid task ID format'),
});

/**
 * Verify OTP Schema
 */
export const EmailVerificationSchema = z.object({
  email: z.email(),
  type: z.enum(['email_verification', 'reset_password']).default('email_verification'),
});
