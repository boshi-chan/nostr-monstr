import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeNotificationsPlugin {
  ensureChannel(options?: { channelId?: string; channelName?: string }): Promise<{ channelId: string }>
  presentNotification(options: { title: string; body: string; id?: number; channelId?: string; channelName?: string }): Promise<{ id?: number }>
  requestPermission?(options?: Record<string, never>): Promise<{ granted: boolean }>
  startBackgroundListener?(options: { pubkey: string }): Promise<{ scheduled?: boolean }>
  stopBackgroundListener?(): Promise<{ stopped?: boolean }>
}

const plugin = typeof window !== 'undefined' ? registerPlugin<NativeNotificationsPlugin>('NotificationsPlugin') : undefined

function isAndroidNative(): boolean {
  return typeof window !== 'undefined' && Capacitor.getPlatform() === 'android'
}

export async function ensureNotificationChannel(): Promise<void> {
  if (!plugin || !isAndroidNative()) return
  try {
    await requestNativeNotificationPermission()
    await plugin.ensureChannel()
  } catch (err) {
    console.warn('[NativeNotifications] ensureChannel failed:', err)
  }
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!plugin || !isAndroidNative() || !plugin.requestPermission) return true
  try {
    const result = await plugin.requestPermission()
    return Boolean(result?.granted ?? true)
  } catch (err) {
    console.warn('[NativeNotifications] requestPermission failed:', err)
    return false
  }
}

export async function presentNativeNotification(title: string, body: string, id?: number): Promise<void> {
  if (!plugin || !isAndroidNative()) return
  try {
    await plugin.presentNotification({ title, body, id })
  } catch (err) {
    console.warn('[NativeNotifications] presentNotification failed:', err)
  }
}

export async function startNativeNotificationListener(pubkey: string): Promise<void> {
  if (!plugin || !isAndroidNative() || !plugin.startBackgroundListener) return
  try {
    const granted = await requestNativeNotificationPermission()
    if (!granted) return
    await plugin.startBackgroundListener({ pubkey })
  } catch (err) {
    console.warn('[NativeNotifications] startBackgroundListener failed:', err)
  }
}

export async function stopNativeNotificationListener(): Promise<void> {
  if (!plugin || !isAndroidNative() || !plugin.stopBackgroundListener) return
  try {
    await plugin.stopBackgroundListener()
  } catch (err) {
    console.warn('[NativeNotifications] stopBackgroundListener failed:', err)
  }
}
