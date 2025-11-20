const consoleRef: Partial<Console> | undefined =
  typeof globalThis !== 'undefined' ? globalThis.console : undefined

const withPrefix = (args: unknown[]) => ['[Monstr]', ...args]

function call(method: 'info' | 'warn' | 'error' | 'debug', args: unknown[]): void {
  const fn = consoleRef?.[method]
  if (typeof fn === 'function') {
    fn.apply(consoleRef, withPrefix(args))
  }
}

import { debugLogStore } from '$stores/debug'

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
    debugLogStore.push({
      level: 'warn',
      message: String(args[0]),
      details: args.slice(1),
      timestamp: Date.now(),
    })
  },
  error: (...args: unknown[]) => {
    call('error', args)
    debugLogStore.push({
      level: 'error',
      message: String(args[0]),
      details: args.slice(1),
      timestamp: Date.now(),
    })
  },
}

export default logger

if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).logger = logger
}
