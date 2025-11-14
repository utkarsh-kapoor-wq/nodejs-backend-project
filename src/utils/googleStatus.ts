import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { authTokens, tasks } from '@/db/schemas';
import logger from '@/core/logger';

/**
 * Google connection helper + Calendar helpers
 *
 * - getGoogleConnectionStatus(req): checks req.user.googleConnected
 * - createCalendarEventForTask(userId, task)
 * - updateCalendarEventForTask(userId, task)
 * - deleteCalendarEventForTask(userId, calendarEventId)
 *
 * These helpers use the access token stored in `auth_tokens` to operate on
 * the user's primary Google Calendar. They are intentionally lightweight —
 * they do not yet refresh expired tokens. For production you'll want to add
 * refresh-token support or use the official googleapis client.
 */

export interface GoogleConnectionResult {
  connected: boolean;
  message: string;
  userId?: string;
  email?: string;
}

export function getGoogleConnectionStatus(req: Request): GoogleConnectionResult {
  const user = (req as unknown as { user?: Record<string, unknown> }).user;

  const { id, email, googleConnected } = user ?? {};

  const connected = !!googleConnected;

  const result: GoogleConnectionResult = {
    connected,
    message: connected
      ? 'Task will be synced with Google Calendar.'
      : 'Please verify your Google account to sync tasks.',
    userId: typeof id === 'string' ? id : undefined,
    email: typeof email === 'string' ? email : undefined,
  };

  try {
    if (connected) {
      logger.info(result.message, { googleConnected: true, userId: result.userId, email: result.email });
    } else {
      logger.warn(result.message, { googleConnected: false, userId: result.userId, email: result.email });
    }
  } catch (err) {
    logger.error('Error logging Google connection status', { err });
  }

  return result;
}

type TokenRow = { id: string; accessToken: string; refreshToken: string; provider: string } | null;

async function getLatestGoogleTokenForUser(userId: string): Promise<TokenRow> {
  const [token] = await db
    .select({
      id: authTokens.id,
      accessToken: authTokens.accessToken,
      refreshToken: authTokens.refreshToken,
      provider: authTokens.provider,
    })
    .from(authTokens)
    .where(eq(authTokens.userId, userId))
    .limit(1);

  return token ?? null;
}

async function verifyAccessToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch (err) {
    logger.error('Error verifying Google access token', { err });
    return false;
  }
}

interface TaskLike {
  id: string;
  title: string;
  description?: string | null;
  startTime?: Date | null;
  endTime?: Date | null;
  calendarEventId?: string | null;
}

export async function createCalendarEventForTask(userId: string, task: TaskLike): Promise<string | null> {
  try {
    if (!task.startTime || !task.endTime) {
      return null;
    }
    const tokenRow = await getLatestGoogleTokenForUser(userId);
    if (!tokenRow) {
      return null;
    }
    const accessToken = tokenRow.accessToken;
    const valid = await verifyAccessToken(accessToken);
    if (!valid) {
      return null;
    }

    const eventPayload: Record<string, unknown> = {
      summary: task.title,
      description: task.description ?? undefined,
      start: { dateTime: task.startTime.toISOString() },
      end: { dateTime: task.endTime.toISOString() },
    };

    const calendarId = 'primary';
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unable to read body');
      logger.warn('Google Calendar create responded with non-OK status', { status: res.status, body: text });
      return null;
    }

    const data = await res.json();
    const eventId = data?.id as string | undefined;
    if (!eventId) {
      return null;
    }

    await db.update(tasks).set({ calendarEventId: eventId, updatedAt: new Date() }).where(eq(tasks.id, task.id));
    return eventId;
  } catch (err) {
    logger.error('Failed to create calendar event for task', { err, userId, taskId: task.id });
    return null;
  }
}

export async function updateCalendarEventForTask(userId: string, task: TaskLike): Promise<string | null> {
  try {
    if (!task.startTime || !task.endTime || !task.calendarEventId) {
      return null;
    }
    const tokenRow = await getLatestGoogleTokenForUser(userId);
    if (!tokenRow) {
      return null;
    }
    const accessToken = tokenRow.accessToken;
    const valid = await verifyAccessToken(accessToken);
    if (!valid) {
      return null;
    }

    const eventPayload: Record<string, unknown> = {
      summary: task.title,
      description: task.description ?? undefined,
      start: { dateTime: task.startTime.toISOString() },
      end: { dateTime: task.endTime.toISOString() },
    };

    const calendarId = 'primary';
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      task.calendarEventId,
    )}`;

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unable to read body');
      logger.warn('Google Calendar update responded with non-OK status', { status: res.status, body: text });
      return null;
    }

    const data = await res.json();
    const eventId = data?.id as string | undefined;
    if (!eventId) {
      return null;
    }

    if (task.calendarEventId !== eventId) {
      await db.update(tasks).set({ calendarEventId: eventId, updatedAt: new Date() }).where(eq(tasks.id, task.id));
    }

    return eventId;
  } catch (err) {
    logger.error('Failed to update calendar event for task', { err, userId, taskId: task.id });
    return null;
  }
}

export async function deleteCalendarEventForTask(userId: string, calendarEventId?: string | null): Promise<boolean> {
  try {
    if (!calendarEventId) {
      return false;
    }
    const tokenRow = await getLatestGoogleTokenForUser(userId);
    if (!tokenRow) {
      return false;
    }
    const accessToken = tokenRow.accessToken;
    const valid = await verifyAccessToken(accessToken);
    if (!valid) {
      return false;
    }

    const calendarId = 'primary';
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      calendarEventId,
    )}`;

    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });

    if (res.status === 204 || res.status === 200) {
      return true;
    }

    const text = await res.text().catch(() => 'unable to read body');
    logger.warn('Google Calendar delete responded with non-OK status', { status: res.status, body: text });
    return false;
  } catch (err) {
    logger.error('Failed to delete calendar event for task', { err, userId, calendarEventId });
    return false;
  }
}

export default getGoogleConnectionStatus;
