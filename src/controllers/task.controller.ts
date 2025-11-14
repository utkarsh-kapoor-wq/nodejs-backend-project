/**
 * Task Management Controller
 *
 * Handles all CRUD operations for task management including creation, retrieval,
 * updating, and deletion of tasks. Implements proper authentication and authorization
 * checks to ensure only verified users can access task operations.
 *
 * Design Patterns Used:
 *  - Controller Pattern: Encapsulates task management logic
 *  - Repository Pattern: Database operations abstracted through Drizzle ORM
 *  - Validation Pattern: Input validation using Zod schemas
 *  - Authorization Pattern: User verification and ownership checks
 *
 * Security Features:
 *  - User authentication required for all operations
 *  - Email verification status validation
 *  - Task ownership verification for update/delete operations
 *  - Input sanitization and validation
 *
 * @module controllers/task.controller
 * @requires drizzle-orm
 * @requires @/db
 * @requires @/db/schemas
 * @requires @/utils/asyncHandler
 * @requires @/utils/errorHandler
 * @requires @/utils/validations
 * @requires @/core/logger
 *
 * @author Development Team
 * @version 1.0.0
 */

import { eq, and, desc, asc, count, like } from 'drizzle-orm';
import { db } from '@/db';
import { tasks } from '@/db/schemas';
import { asyncHandler, Response, validate } from '@/utils/asyncHandler';
import ErrorHandler from '@/utils/errorHandler';
import { CreateTaskSchema, UpdateTaskSchema, TaskQuerySchema, TaskParamsSchema } from '@/utils/validations';
import logger from '@/core/logger';
import { authMiddleware } from '@/middlewares/auth.middleware';
import type { AuthenticatedRequest } from '@/types/auth-request';
import { verifyUserAccess } from '@/middlewares/verifyUserAccess';
import getGoogleConnectionStatus, {
  createCalendarEventForTask,
  updateCalendarEventForTask,
  deleteCalendarEventForTask,
} from '@/utils/googleStatus';

/**
 * Create New Task Handler
 *
 * Creates a new task for the authenticated user. Validates input data,
 * ensures user is verified, and stores the task with proper associations.
 *
 * @route POST /api/tasks
 * @access Private (Authenticated + Verified users only)
 * @param {AuthenticatedRequest} req - Express request with user data
 * @returns {Object} Created task details
 * @throws {AuthError} If user is not authenticated
 * @throws {ForbiddenError} If user email is not verified
 * @throws {ValidationError} If input validation fails
 * @throws {DatabaseError} If task creation fails
 *
 * @example
 * // Request Body:
 * {
 *   "title": "Complete project documentation",
 *   "description": "Write comprehensive API documentation",
 *   "status": "pending",
 *   "startTime": "2024-10-25T09:00:00Z",
 *   "endTime": "2024-10-25T17:00:00Z"
 * }
 *
 * // Response:
 * {
 *   "success": true,
 *   "message": "Task created successfully",
 *   "data": {
 *     "id": "uuid-string",
 *     "title": "Complete project documentation",
 *     "description": "Write comprehensive API documentation",
 *     "status": "pending",
 *     "startTime": "2024-10-25T09:00:00Z",
 *     "endTime": "2024-10-25T17:00:00Z",
 *     "userId": "user-uuid",
 *     "createdAt": "2024-10-22T10:30:00Z",
 *     "updatedAt": "2024-10-22T10:30:00Z"
 *   }
 * }
 */
export const createTaskHandler = asyncHandler(async (req: AuthenticatedRequest) => {
  verifyUserAccess(req);

  const { title, description, status, startTime, endTime, calendarEventId } = req.body;

  // Validate time constraints
  if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
    throw ErrorHandler.ValidationError('Start time must be before end time');
  }

  const [newTask] = await db
    .insert(tasks)
    .values({
      userId: req.user.id,
      title: title.trim(),
      description: description?.trim(),
      status: status ?? 'pending',
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      // Always initialize calendarEventId as null on create. We'll sync with Google and
      // persist the real calendar event id returned by Google.
      calendarEventId: null,
    })
    .returning();

  if (!newTask) {
    throw ErrorHandler.DatabaseError('Failed to create task');
  }

  logger.info('Task created successfully', {
    taskId: newTask.id,
    userId: req.user.id,
    title: newTask.title,
  });

  // Attempt to sync to Google Calendar if user has connected Google
  let calendarSynced = false;
  let calendarSyncMessage = 'Not attempted';

  try {
    const eventId = await createCalendarEventForTask(req.user.id, newTask as any);
    if (eventId) {
      // ensure response contains calendarEventId
      newTask.calendarEventId = eventId;
      calendarSynced = true;
      calendarSyncMessage = 'Task created in Google Calendar';
    } else {
      calendarSynced = false;
      calendarSyncMessage = 'Task not synced to Google Calendar (no token or API error)';
    }
  } catch (err) {
    // don't block task creation on calendar errors
    logger.warn('Google calendar create failed for new task', { err, taskId: newTask.id, userId: req.user.id });
    calendarSynced = false;
    calendarSyncMessage = 'Google calendar create failed (see server logs)';
  }

  return {
    data: newTask,
    message: 'Task created successfully',
    statusCode: 201,
    meta: { calendarSynced, calendarSyncMessage },
  };
});

/**
 * Get All Tasks Handler
 *
 * Retrieves paginated list of tasks for the authenticated user with optional
 * filtering and sorting capabilities. Supports search, status filtering,
 * and date range filtering.
 *
 * @route GET /api/tasks
 * @access Private (Authenticated + Verified users only)
 * @param {AuthenticatedRequest} req - Express request with query parameters
 * @returns {Object} Paginated list of tasks with metadata
 * @throws {AuthError} If user is not authenticated
 * @throws {ForbiddenError} If user email is not verified
 * @throws {ValidationError} If query parameters are invalid
 *
 * @example
 * // Request: GET /api/tasks?page=1&limit=10&status=pending&search=project&sortBy=createdAt&sortOrder=desc
 *
 * // Response:
 * {
 *   "success": true,
 *   "message": "Tasks retrieved successfully",
 *   "data": [
 *     {
 *       "id": "uuid-string",
 *       "title": "Complete project documentation",
 *       "status": "pending",
 *       "createdAt": "2024-10-22T10:30:00Z"
 *     }
 *   ],
 *   "meta": {
 *     "pagination": {
 *       "total": 25,
 *       "page": 1,
 *       "limit": 10,
 *       "totalPages": 3,
 *       "hasNext": true,
 *       "hasPrev": false
 *     }
 *   }
 * }
 */
export const getTasksHandler = asyncHandler(async (req: AuthenticatedRequest) => {
  verifyUserAccess(req);

  const {
    page = 1,
    limit = 10,
    status,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    startDate,
    endDate,
  } = req.query;

  // Build dynamic where conditions
  const whereConditions = [eq(tasks.userId, req.user.id)];

  if (status) {
    whereConditions.push(eq(tasks.status, status as string));
  }

  if (search) {
    whereConditions.push(like(tasks.title, `%${search}%`));
  }

  if (startDate) {
    whereConditions
      .push
      // Filter tasks that start after the given date
      // You might want to adjust this based on your business logic
      ();
  }

  // Calculate offset for pagination
  const offset = (Number(page) - 1) * Number(limit);

  // Get total count for pagination metadata
  const [totalResult] = await db
    .select({ count: count() })
    .from(tasks)
    .where(and(...whereConditions));

  const total = totalResult.count;

  // Get paginated tasks with sorting
  const sortColumn = sortBy === 'title' ? tasks.title : tasks.createdAt;
  const sortDirection = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const userTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      startTime: tasks.startTime,
      endTime: tasks.endTime,
      calendarEventId: tasks.calendarEventId,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(and(...whereConditions))
    .orderBy(sortDirection)
    .limit(Number(limit))
    .offset(offset);

  logger.info('Tasks retrieved successfully', {
    userId: req.user.id,
    count: userTasks.length,
    total,
    page: Number(page),
    filters: { status, search, startDate, endDate },
  });

  return Response.paginated(userTasks, total, Number(page), Number(limit), 'Tasks retrieved successfully');
});

/**
 * Get Single Task Handler
 *
 * Retrieves a specific task by ID for the authenticated user.
 * Verifies task ownership before returning the data.
 *
 * @route GET /api/tasks/:id
 * @access Private (Authenticated + Verified users only)
 * @param {AuthenticatedRequest} req - Express request with task ID parameter
 * @returns {Object} Task details
 * @throws {AuthError} If user is not authenticated
 * @throws {ForbiddenError} If user email is not verified
 * @throws {NotFoundError} If task doesn't exist or doesn't belong to user
 * @throws {ValidationError} If task ID is invalid
 */
export const getTaskByIdHandler = asyncHandler(async (req: AuthenticatedRequest) => {
  verifyUserAccess(req);

  const { id } = req.params;

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, req.user.id)))
    .limit(1);

  if (!task) {
    throw ErrorHandler.NotFound('Task not found or access denied');
  }

  logger.info('Task retrieved by ID', {
    taskId: task.id,
    userId: req.user.id,
    title: task.title,
  });

  return Response.success(task, 'Task retrieved successfully');
});

/**
 * Update Task Handler
 *
 * Updates an existing task for the authenticated user. Validates input data,
 * ensures task ownership, and applies partial updates.
 *
 * @route PUT /api/tasks/:id
 * @access Private (Authenticated + Verified users only)
 * @param {AuthenticatedRequest} req - Express request with task ID and update data
 * @returns {Object} Updated task details
 * @throws {AuthError} If user is not authenticated
 * @throws {ForbiddenError} If user email is not verified
 * @throws {NotFoundError} If task doesn't exist or doesn't belong to user
 * @throws {ValidationError} If update data is invalid
 * @throws {DatabaseError} If update operation fails
 */
export const updateTaskHandler = asyncHandler(async (req: AuthenticatedRequest) => {
  verifyUserAccess(req);

  const { id } = req.params;
  const updateData = req.body;

  // Check if task exists and belongs to user
  const [existingTask] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, req.user.id)))
    .limit(1);

  if (!existingTask) {
    throw ErrorHandler.NotFound('Task not found or access denied');
  }

  // Validate time constraints if both times are provided
  const startTime = updateData.startTime ?? existingTask.startTime;
  const endTime = updateData.endTime ?? existingTask.endTime;

  if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
    throw ErrorHandler.ValidationError('Start time must be before end time');
  }

  // Prepare update object with only provided fields
  const updates: Partial<typeof tasks.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (updateData.title !== undefined) {
    updates.title = updateData.title.trim();
  }
  if (updateData.description !== undefined) {
    updates.description = updateData.description?.trim();
  }
  if (updateData.status !== undefined) {
    updates.status = updateData.status;
  }
  if (updateData.startTime !== undefined) {
    updates.startTime = updateData.startTime ? new Date(updateData.startTime) : null;
  }
  if (updateData.endTime !== undefined) {
    updates.endTime = updateData.endTime ? new Date(updateData.endTime) : null;
  }
  if (updateData.calendarEventId !== undefined) {
    updates.calendarEventId = updateData.calendarEventId;
  }

  const [updatedTask] = await db
    .update(tasks)
    .set(updates)
    .where(and(eq(tasks.id, id), eq(tasks.userId, req.user.id)))
    .returning();

  if (!updatedTask) {
    throw ErrorHandler.DatabaseError('Failed to update task');
  }

  logger.info('Task updated successfully', {
    taskId: updatedTask.id,
    userId: req.user.id,
    updatedFields: Object.keys(updates),
  });

  // Attempt to sync update to Google Calendar if user has connected Google
  let calendarSynced = false;
  let calendarSyncMessage = 'Not attempted';

  try {
    const eventId = await updateCalendarEventForTask(req.user.id, updatedTask as any);
    if (eventId) {
      updatedTask.calendarEventId = eventId;
      calendarSynced = true;
      calendarSyncMessage = 'Task updated in Google Calendar';
    } else {
      calendarSynced = false;
      calendarSyncMessage = 'Task not synced to Google Calendar (no token or API error)';
    }
  } catch (err) {
    logger.warn('Google calendar update failed for updated task', { err, taskId: updatedTask.id, userId: req.user.id });
    calendarSynced = false;
    calendarSyncMessage = 'Google calendar update failed (see server logs)';
  }

  return {
    data: updatedTask,
    message: 'Task updated successfully',
    statusCode: 200,
    meta: { calendarSynced, calendarSyncMessage },
  };
});

/**
 * Delete Task Handler
 *
 * Deletes a specific task for the authenticated user.
 * Verifies task ownership before deletion.
 *
 * @route DELETE /api/tasks/:id
 * @access Private (Authenticated + Verified users only)
 * @param {AuthenticatedRequest} req - Express request with task ID parameter
 * @returns {Object} Deletion confirmation
 * @throws {AuthError} If user is not authenticated
 * @throws {ForbiddenError} If user email is not verified
 * @throws {NotFoundError} If task doesn't exist or doesn't belong to user
 * @throws {DatabaseError} If deletion operation fails
 */
export const deleteTaskHandler = asyncHandler(async (req: AuthenticatedRequest) => {
  verifyUserAccess(req);

  const { id } = req.params;

  // Check if task exists and belongs to user
  const [existingTask] = await db
    .select({ id: tasks.id, title: tasks.title, calendarEventId: tasks.calendarEventId })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, req.user.id)))
    .limit(1);

  if (!existingTask) {
    throw ErrorHandler.NotFound('Task not found or access denied');
  }

  // Delete the task
  const [deletedTask] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, req.user.id)))
    .returning({ id: tasks.id });

  if (!deletedTask) {
    throw ErrorHandler.DatabaseError('Failed to delete task');
  }

  logger.info('Task deleted successfully', {
    taskId: existingTask.id,
    userId: req.user.id,
    title: existingTask.title,
  });

  // Attempt to delete associated calendar event when deleting task
  let calendarSynced = false;
  let calendarSyncMessage = 'Not attempted';

  try {
    const deleted = await deleteCalendarEventForTask(req.user.id, existingTask.calendarEventId);
    if (deleted) {
      calendarSynced = true;
      calendarSyncMessage = 'Calendar event deleted';
      logger.info('Deleted calendar event for task', { taskId: existingTask.id, userId: req.user.id });
    } else {
      calendarSynced = false;
      calendarSyncMessage = 'Calendar event not deleted (no token or API error)';
    }
  } catch (err) {
    logger.warn('Google calendar delete failed for task', { err, taskId: existingTask.id, userId: req.user.id });
    calendarSynced = false;
    calendarSyncMessage = 'Google calendar delete failed (see server logs)';
  }

  return {
    message: 'Task deleted successfully',
    statusCode: 200,
    meta: { calendarSynced, calendarSyncMessage },
  };
});

/**
 * Get Task Statistics Handler
 *
 * Retrieves task statistics for the authenticated user including
 * status distribution, completion rate, and upcoming tasks.
 *
 * @route GET /api/tasks/stats
 * @access Private (Authenticated + Verified users only)
 * @param {AuthenticatedRequest} req - Express request
 * @returns {Object} Task statistics
 */
export const getTaskStatsHandler = asyncHandler(async (req: AuthenticatedRequest) => {
  verifyUserAccess(req);

  // Get task count by status
  const statusStats = await db
    .select({
      status: tasks.status,
      count: count(),
    })
    .from(tasks)
    .where(eq(tasks.userId, req.user.id))
    .groupBy(tasks.status);

  // Get total tasks
  const [totalTasksResult] = await db.select({ count: count() }).from(tasks).where(eq(tasks.userId, req.user.id));

  const totalTasks = totalTasksResult.count;

  // Get upcoming tasks (next 7 days)
  const upcomingTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      startTime: tasks.startTime,
      status: tasks.status,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, req.user.id),
        // Add date filter for next 7 days
      ),
    )
    .orderBy(asc(tasks.startTime))
    .limit(5);

  const stats = {
    totalTasks,
    statusDistribution: statusStats.reduce(
      (acc, stat) => {
        acc[stat.status] = stat.count;
        return acc;
      },
      {} as Record<string, number>,
    ),
    upcomingTasks,
    completionRate:
      totalTasks > 0
        ? Math.round(((statusStats.find(s => s.status === 'completed')?.count ?? 0) / totalTasks) * 100)
        : 0,
  };

  logger.info('Task statistics retrieved', {
    userId: req.user.id,
    totalTasks,
  });

  return Response.success(stats, 'Task statistics retrieved successfully');
});

// Export handlers with validation middleware
export const createTaskWithValidation = [
  validate(data => CreateTaskSchema.parse(data)),
  authMiddleware,
  createTaskHandler,
];

export const getTasksWithValidation = [validate(data => TaskQuerySchema.parse(data)), authMiddleware, getTasksHandler];

export const updateTaskWithValidation = [
  validate(data => UpdateTaskSchema.parse(data)),
  authMiddleware,
  updateTaskHandler,
];

export const getTaskByIdWithValidation = [
  validate(data => TaskParamsSchema.parse(data)),
  authMiddleware,
  getTaskByIdHandler,
];

export const deleteTaskWithValidation = [
  validate(data => TaskParamsSchema.parse(data)),
  authMiddleware,
  deleteTaskHandler,
];
