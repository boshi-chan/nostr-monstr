import { Capacitor, registerPlugin } from '@capacitor/core'

type WalletStoragePlugin = {
  saveWalletBlob(options: { key: string; value: string }): Promise<{ success?: boolean }>
  loadWalletBlob(options: { key: string }): Promise<{ value?: string | null }>
  clearWalletBlob(options: { key: string }): Promise<{ success?: boolean }>
}

const walletStorage = typeof window !== 'undefined'
  ? registerPlugin<WalletStoragePlugin>('WalletStorage')
  : undefined

export function isNativeWalletStorageAvailable(): boolean {
  return typeof window !== 'undefined' && Capacitor.getPlatform() === 'android'
}

export async function setNativeWalletValue(key: string, value: unknown): Promise<boolean> {
  if (!isNativeWalletStorageAvailable() || !walletStorage) {
    return false
  }

  if (value === null || value === undefined) {
    await walletStorage.clearWalletBlob({ key })
    return true
  }

  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  await walletStorage.saveWalletBlob({ key, value: serialized })
  return true
}

export async function getNativeWalletValue<T = unknown>(key: string): Promise<T | null> {
  if (!isNativeWalletStorageAvailable() || !walletStorage) {
    return null
  }

  const result = await walletStorage.loadWalletBlob({ key })
  const storedValue = result?.value
  if (storedValue == null) {
    return null
  }

  try {
    return JSON.parse(storedValue) as T
  } catch {
    return storedValue as unknown as T
  }
}

export async function clearNativeWalletValue(key: string): Promise<boolean> {
  if (!isNativeWalletStorageAvailable() || !walletStorage) {
    return false
  }
  await walletStorage.clearWalletBlob({ key })
  return true
}
