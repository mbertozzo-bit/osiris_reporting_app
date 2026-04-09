import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? '\n' + stack : ''}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // File transport for errors
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Audit log function
export function auditLog(
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: string,
  ipAddress?: string
): void {
  logger.info(`AUDIT: ${action}`, {
    userId,
    entityType,
    entityId,
    details,
    ipAddress
  });
  
  // Also write to database if needed
  // This would require the database connection
}

// Email log function
export function emailLog(
  agentId: string,
  messageId: string,
  status: string,
  details?: string
): void {
  logger.info(`EMAIL: ${status}`, {
    agentId,
    messageId,
    details
  });
}

// File processing log function
export function fileLog(
  filename: string,
  fileType: string,
  month: number,
  year: number,
  status: string,
  details?: string
): void {
  logger.info(`FILE: ${status}`, {
    filename,
    fileType,
    month,
    year,
    details
  });
}

export default logger;