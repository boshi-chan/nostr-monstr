const consoleRef: Partial<Console> | undefined =
  typeof globalThis !== 'undefined' ? globalThis.console : undefined

const withPrefix = (args: unknown[]) => ['[Monstr]', ...args]

function call(method: 'info' | 'warn' | 'error' | 'debug', args: unknown[]): void {
  const fn = consoleRef?.[method]
  if (typeof fn === 'function') {
    fn.apply(consoleRef, withPrefix(args))
  }
}

const importMetaDev = typeof import.meta !== 'undefined' ? (import.meta as any) : {}
const isDev = Boolean(importMetaDev.env?.DEV)

export const logger = {
  info: (...args: unknown[]) => {
    if (isDev) call('info', args)
  },
  debug: (...args: unknown[]) => {
    if (isDev) call('debug', args)
  },
  warn: (...args: unknown[]) => {
    call('warn', args)
  },
  error: (...args: unknown[]) => {
    call('error', args)
  },
}

export default logger

if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).logger = logger
}
