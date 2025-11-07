import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

interface WalletFsDB extends DBSchema {
  files: {
    key: string
    value: ArrayBuffer
  }
}

let dbPromise: Promise<IDBPDatabase<WalletFsDB>> | null = null

async function getDb(): Promise<IDBPDatabase<WalletFsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WalletFsDB>('monstr-wallet-fs', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files')
        }
      },
    })
  }
  return dbPromise
}

function toUint8Array(data: any): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer) {
    return new Uint8Array(data)
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  if (typeof data === 'string') {
    return new TextEncoder().encode(data)
  }
  throw new Error('Unsupported data type for wallet FS')
}

async function writeFile(path: string, data: any, _encoding?: string): Promise<void> {
  const bytes = toUint8Array(data)
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const db = await getDb()
  await db.put('files', copy, path)
}

async function readFile(path: string, encoding?: string): Promise<any> {
  const db = await getDb()
  const record = await db.get('files', path)
  if (!record) {
    throw Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: 'ENOENT' })
  }
  const bytes = new Uint8Array(record)
  if (encoding === 'utf8' || encoding === 'utf-8') {
    return new TextDecoder().decode(bytes)
  }
  if (encoding === 'binary') {
    return bytes
  }
  return bytes
}

async function rename(oldPath: string, newPath: string): Promise<void> {
  const db = await getDb()
  const record = await db.get('files', oldPath)
  if (!record) {
    throw Object.assign(new Error(`ENOENT: no such file '${oldPath}'`), { code: 'ENOENT' })
  }
  await db.put('files', record, newPath)
  await db.delete('files', oldPath)
}

async function access(path: string): Promise<void> {
  const db = await getDb()
  const exists = await db.getKey('files', path)
  if (!exists) {
    throw Object.assign(new Error(`ENOENT: no such file '${path}'`), { code: 'ENOENT' })
  }
}

async function unlink(path: string): Promise<void> {
  const db = await getDb()
  await db.delete('files', path)
}

async function mkdir(_path: string): Promise<void> {
  // no-op
}

async function readdir(_path: string): Promise<string[]> {
  return []
}

async function stat(path: string): Promise<{ isFile: () => boolean; isDirectory: () => boolean }> {
  const db = await getDb()
  const record = await db.get('files', path)
  return {
    isFile: () => Boolean(record),
    isDirectory: () => false,
  }
}

const browserFs = {
  writeFile,
  readFile,
  rename,
  access,
  unlink,
  mkdir,
  readdir,
  stat,
}

export type BrowserFs = typeof browserFs

export function getBrowserFs(): BrowserFs {
  return browserFs
}

export async function resetBrowserFs(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('files', 'readwrite')
  await tx.store.clear()
  await tx.done
}
