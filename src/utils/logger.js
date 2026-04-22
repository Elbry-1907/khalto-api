const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

const logDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const fmt = winston.format;

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fmt.combine(
    fmt.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    fmt.errors({ stack: true }),
    fmt.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: fmt.combine(
        fmt.colorize(),
        fmt.printf(({ level, message, timestamp, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}] ${message}${extra}`;
        }),
      ),
    }),
    new winston.transports.File({ filename: path.join(logDir, 'error.log'),  level: 'error', maxsize: 5e6, maxFiles: 5 }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log'), maxsize: 10e6, maxFiles: 10 }),
  ],
  exceptionHandlers: [ new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') }) ],
});

module.exports = logger;
