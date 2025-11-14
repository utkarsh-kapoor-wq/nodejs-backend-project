// Deprecated wrapper: re-export everything from `googleStatus` so the
// single source-of-truth remains `src/utils/googleStatus.ts`.
import * as GoogleStatus from './googleStatus';

export const { createCalendarEventForTask, updateCalendarEventForTask, deleteCalendarEventForTask } = GoogleStatus;

export default GoogleStatus;
