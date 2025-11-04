import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { NostrEvent } from '$types/nostr'

interface MonstrDB extends DBSchema {
  events: {
    key: string
    value: NostrEvent
    indexes: { 'by-pubkey': string; 'by-kind': number; 'by-created': number }
  }
  threads: {
    key: string
    value: { rootId: string; eventIds: string[] }
  }
  dmIndex: {
    key: string
    value: { pubkey: string; lastUpdated: number }
  }
  settings: {
    key: string
    value: any
  }
  walletMetaEncrypted: {
    key: string
    value: { encryptedData: string; iv: string; salt: string }
  }
}

let db: IDBPDatabase<MonstrDB>

export async function initDB(): Promise<IDBPDatabase<MonstrDB>> {
  db = await openDB<MonstrDB>('monstr', 1, {
    upgrade(db) {
      // Events store
      if (!db.objectStoreNames.contains('events')) {
        const eventStore = db.createObjectStore('events', { keyPath: 'id' })
        eventStore.createIndex('by-pubkey', 'pubkey')
        eventStore.createIndex('by-kind', 'kind')
        eventStore.createIndex('by-created', 'created_at')
      }

      // Threads index
      if (!db.objectStoreNames.contains('threads')) {
        db.createObjectStore('threads', { keyPath: 'rootId' })
      }

      // DM index
      if (!db.objectStoreNames.contains('dmIndex')) {
        db.createObjectStore('dmIndex', { keyPath: 'pubkey' })
      }

      // Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }

      // Encrypted wallet metadata
      if (!db.objectStoreNames.contains('walletMetaEncrypted')) {
        db.createObjectStore('walletMetaEncrypted', { keyPath: 'key' })
      }
    },
  })

  return db
}

export function getDB(): IDBPDatabase<MonstrDB> {
  if (!db) throw new Error('Database not initialized')
  return db
}

export async function addEvent(event: NostrEvent): Promise<void> {
  const db = getDB()
  await db.put('events', event)
}

export async function getEventById(id: string): Promise<NostrEvent | undefined> {
  const db = getDB()
  return await db.get('events', id)
}

export async function getEventsByAuthor(pubkey: string): Promise<NostrEvent[]> {
  const db = getDB()
  return await db.getAllFromIndex('events', 'by-pubkey', pubkey)
}

export async function saveSetting(key: string, value: any): Promise<void> {
  const db = getDB()
  await db.put('settings', { key, value })
}

export async function getSetting(key: string): Promise<any> {
  const db = getDB()
  const record = await db.get('settings', key)
  return record?.value
}
