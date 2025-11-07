type Primitive = string | number | boolean | bigint | symbol | undefined | null

function fail(message?: string): never {
  throw new Error(message ?? 'Assertion failed')
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Number.isNaN(a) && Number.isNaN(b)) return true
  return false
}

interface AssertFn {
  (value: unknown, message?: string): asserts value
  ok: (value: unknown, message?: string) => asserts value
  equal: (actual: Primitive, expected: Primitive, message?: string) => void
  notEqual: (actual: Primitive, expected: Primitive, message?: string) => void
  strictEqual: (actual: unknown, expected: unknown, message?: string) => void
  notStrictEqual: (actual: unknown, expected: unknown, message?: string) => void
  fail: (message?: string) => never
}

const assert: AssertFn = ((value: unknown, message?: string): asserts value => {
  if (!value) fail(message)
}) as AssertFn

assert.ok = assert

assert.equal = (actual: Primitive, expected: Primitive, message?: string): void => {
  if (actual != expected) fail(message ?? `Expected ${String(actual)} == ${String(expected)}`)
}

assert.notEqual = (actual: Primitive, expected: Primitive, message?: string): void => {
  if (actual == expected) fail(message ?? `Expected ${String(actual)} != ${String(expected)}`)
}

assert.strictEqual = (actual: unknown, expected: unknown, message?: string): void => {
  if (!isEqual(actual, expected)) {
    fail(message ?? `Expected ${String(actual)} === ${String(expected)}`)
  }
}

assert.notStrictEqual = (actual: unknown, expected: unknown, message?: string): void => {
  if (isEqual(actual, expected)) {
    fail(message ?? `Expected ${String(actual)} !== ${String(expected)}`)
  }
}

assert.fail = fail

export default assert
export { assert }
