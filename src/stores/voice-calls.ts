/**
 * Voice Calls Store
 * Manages call state, history, and UI state
 */

import { writable, derived } from 'svelte/store'
import type { ActiveCall, IncomingCallAlert, CallRecord, CallConfig } from '$types/voice-calls'

/**
 * Current active call (null if no call active)
 */
export const activeCall = writable<ActiveCall | null>(null)

/**
 * Incoming call alert (null if no incoming call)
 */
export const incomingCall = writable<IncomingCallAlert | null>(null)

/**
 * Call history (recent calls)
 */
export const callHistory = writable<CallRecord[]>([])

/**
 * Call configuration
 */
export const callConfig = writable<CallConfig>({
  autoAcceptFromFollowing: false,
  callTimeout: 30,
  enableVideo: false,
  enableScreenShare: false,
  recordCalls: false,
})

/**
 * UI state
 */
export const callLoading = writable(false)
export const callError = writable<string | null>(null)

/**
 * Call statistics (updated during active call)
 */
export const callStats = writable({
  audioLevel: 0,
  audioCodec: '',
  bytesReceived: 0,
  bytesSent: 0,
  packetsLost: 0,
  roundTripTime: 0,
  jitter: 0,
})

/**
 * Derived: Is user in a call?
 */
export const isInCall = derived(activeCall, $activeCall => {
  return $activeCall?.state === 'connected' || $activeCall?.state === 'connecting'
})

/**
 * Derived: Is user being called?
 */
export const hasIncomingCall = derived(incomingCall, $incoming => {
  return $incoming !== null
})

/**
 * Derived: Current call duration in seconds
 */
export const callDuration = derived(activeCall, $activeCall => {
  if (!$activeCall || $activeCall.state !== 'connected') return 0
  return Math.floor((Date.now() - $activeCall.startTime) / 1000)
})

/**
 * Derived: Formatted call duration (MM:SS)
 */
export const formattedCallDuration = derived(callDuration, $duration => {
  const minutes = Math.floor($duration / 60)
  const seconds = $duration % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

/**
 * Derived: Sorted call history (newest first)
 */
export const sortedCallHistory = derived(callHistory, $history => {
  return [...$history].sort((a, b) => b.endTime - a.endTime)
})

/**
 * Derived: Recent calls (last 20)
 */
export const recentCalls = derived(sortedCallHistory, $history => {
  return $history.slice(0, 20)
})

/**
 * Derived: Missed calls count
 */
export const missedCallsCount = derived(callHistory, $history => {
  return $history.filter(call => call.status === 'missed').length
})

/**
 * Derived: Total call time (in seconds)
 */
export const totalCallTime = derived(callHistory, $history => {
  return $history.reduce((total, call) => total + call.duration, 0)
})

/**
 * Derived: Average call duration (in seconds)
 */
export const averageCallDuration = derived(callHistory, $history => {
  if ($history.length === 0) return 0
  return Math.floor($history.reduce((total, call) => total + call.duration, 0) / $history.length)
})

/**
 * Helper: Add call to history
 */
export function addCallToHistory(call: CallRecord): void {
  callHistory.update(history => [call, ...history])
}

/**
 * Helper: Clear call history
 */
export function clearCallHistory(): void {
  callHistory.set([])
}

/**
 * Helper: Remove call from history by ID
 */
export function removeCallFromHistory(callId: string): void {
  callHistory.update(history => history.filter(call => call.id !== callId))
}

/**
 * Helper: Format call duration for display
 */
export function formatCallDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

/**
 * Helper: Get call status string
 */
export function getCallStatusString(status: CallRecord['status']): string {
  const statusMap: Record<CallRecord['status'], string> = {
    completed: 'Completed',
    missed: 'Missed',
    declined: 'Declined',
    failed: 'Failed',
  }
  return statusMap[status]
}

/**
 * Helper: Get call type string
 */
export function getCallTypeString(type: 'incoming' | 'outgoing'): string {
  return type === 'incoming' ? 'Incoming' : 'Outgoing'
}
