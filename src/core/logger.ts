/**
 * Logger configuration using Winston with daily rotating file transport.
 *
 * Logs are stored in the directory specified by the LOG_DIR
 * environment variable. The logger supports different log levels
 * based on the application environment (development or production).
 * It also handles uncaught exceptions and formats logs in JSON.
 *
 * Log files are rotated daily, with a maximum size of 20MB
 * and retention of 14 days.
 *
 * @example:
 * import logger from '@/core/logger';
 *
 * logger.info('This is an info message');
 * logger.error('This is an error message');
 * logger.debug('This is a debug message');
 *
 * @module logger
 * @requires winston
 * @requires winston-daily-rotate-file
 * @requires fs
 * @exports logger - Configured Winston logger instance
 *
 * --- IGNORE ---
 *
 * This file is excluded from code coverage as it primarily deals with
 * logging configuration and does not contain business logic.
 *
 * --- END IGNORE ---
 */
import fs from 'fs';
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { uploadLogToS3 } from './aws/s3.service';

// Use process.env directly to avoid circular dependency with @/env
const dir = process.env.LOG_DIR ?? './logs';

// Create log directory if it doesn't exist
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Determine log level based on environment
const logLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'warn';

/**
 * Custom format for console output in development
 */
const consoleFormat = format.combine(
  format.errors({ stack: true }),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.colorize({ all: true }),
  format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    // Add stack trace if present
    if (stack) {
      log += `\n${stack}`;
    }

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  }),
);

/**
 * Winston Logger Instance
 * - Logs to console and daily rotating file
 * - Handles uncaught exceptions
 * - Formats logs in JSON with timestamps and stack traces
 */
const dailyRotateFile: DailyRotateFile = new DailyRotateFile({
  level: logLevel,
  filename: `${dir}/%DATE%-results.log`,
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  handleExceptions: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: format.combine(format.errors({ stack: true }), format.timestamp(), format.json()),
});

dailyRotateFile.on('new', async (filename: string) => {
  try {
    await uploadLogToS3(filename);
  } catch (error) {
    console.error('Error uploading log file to S3:', error);
  }
});

/**
 * Configured Winston Logger Instance
 * @type {import('winston').Logger}
 * @example
 * logger.info('This is an info message');
 * logger.error('This is an error message');
 * logger.debug('This is a debug message');
 */
export default createLogger({
  transports: [
    new transports.Console({
      level: logLevel,
      format: consoleFormat,
    }),
    dailyRotateFile,
  ],
  exceptionHandlers: [dailyRotateFile],
  exitOnError: false,
});
