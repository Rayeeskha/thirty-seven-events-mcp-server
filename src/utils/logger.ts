const isSilent = process.env.NODE_ENV === 'test';

function write(level: 'debug' | 'info' | 'error', message: string, meta?: unknown): void {
  if (isSilent) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const sink = level === 'error' ? console.error : console.log;
  if (meta === undefined) sink(line);
  else sink(line, meta);
}

export const logger = {
  debug: (message: string) => write('debug', message),
  info: (message: string) => write('info', message),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
