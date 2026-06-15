// Minimal logging facade. In dev it writes to the console; in production it is
// quiet by default (hook a remote sink in here later — Sentry, etc.).

type Level = 'debug' | 'info' | 'warn' | 'error';

const enabled = __DEV__;

function emit(level: Level, scope: string, args: unknown[]) {
  if (!enabled && level === 'debug') return;
  const tag = `[${scope}]`;
  // eslint-disable-next-line no-console
  (console[level] ?? console.log)(tag, ...args);
}

export function createLogger(scope: string) {
  return {
    debug: (...a: unknown[]) => emit('debug', scope, a),
    info: (...a: unknown[]) => emit('info', scope, a),
    warn: (...a: unknown[]) => emit('warn', scope, a),
    error: (...a: unknown[]) => emit('error', scope, a),
  };
}

export const logger = createLogger('app');
