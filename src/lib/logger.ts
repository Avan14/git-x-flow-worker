import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
    base: {
        service: process.env.SERVICE_NAME || 'gitxflow-worker',
    },
    formatters: {
        level: (label) => ({ level: label }),
    },
});

export type Logger = typeof logger;

export function createChildLogger(
    bindings: Record<string, unknown>
): pino.Logger {
    return logger.child(bindings);
}
