import { get } from 'svelte/store'
import { walletState } from '$stores/wallet'
import { currentUser } from '$stores/auth'
import { refreshWallet } from '$lib/wallet/lazy'
import type { User } from '$types/user'

const SYNC_INTERVAL_MS = 60_000

let lifecycleInitialized = false
let backgroundTimer: number | null = null
let syncInFlight = false
export function initWalletLifecycle(): void {
  if (lifecycleInitialized || typeof window === 'undefined') {
    return
  }
  lifecycleInitialized = true

  walletState.subscribe(handleWalletChange)
  currentUser.subscribe(handleUserChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  evaluateSyncLoop()
}

function handleWalletChange(): void {
  evaluateSyncLoop()
}

function handleUserChange(user: User | null): void {
  if (!user) {
    stopBackgroundSync()
    return
  }
  evaluateSyncLoop()
}

function evaluateSyncLoop(): void {
  const state = get(walletState)
  if (!state.hasWallet || !state.isReady) {
    stopBackgroundSync()
    return
  }
  startBackgroundSync()
}

function startBackgroundSync(): void {
  if (backgroundTimer !== null) {
    return
  }
  runSync('start').catch(err => {
    logger.warn('Initial wallet sync failed', err)
  })
  backgroundTimer = window.setInterval(() => {
    runSync('interval').catch(err => {
      logger.warn('Background wallet sync failed', err)
    })
  }, SYNC_INTERVAL_MS)
}

function stopBackgroundSync(): void {
  if (backgroundTimer !== null) {
    clearInterval(backgroundTimer)
    backgroundTimer = null
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    runSync('focus').catch(err => {
      logger.warn('Wallet sync on focus failed', err)
    })
  }
}

async function runSync(reason: 'start' | 'interval' | 'focus'): Promise<void> {
  if (syncInFlight) {
    return
  }
  const state = get(walletState)
  if (!state.hasWallet || !state.isReady) {
    return
  }
  if (reason === 'interval' && document.visibilityState === 'hidden') {
    return
  }
  syncInFlight = true
  try {
    await refreshWallet()
  } catch (err) {
    throw err
  } finally {
    syncInFlight = false
  }
}

