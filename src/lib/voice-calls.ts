// @ts-nocheck
/**
 * Voice Calls Service
 * Handles Nostr-based peer-to-peer voice calling
 * Implements Signal-like calling experience
 */

import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import { metadataCache } from '$stores/feed'
import {
  activeCall,
  incomingCall,
  callHistory,
  callLoading,
  callError,
  addCallToHistory,
} from '$stores/voice-calls'
import type {
  ActiveCall,
  IncomingCallAlert,
  CallRecord,
  CallEventContent,
  CallError,
} from '$types/voice-calls'
import { CALL_EVENT_KINDS } from '$types/voice-calls'
import type { NostrEvent } from '$types/nostr'
import { get } from 'svelte/store'
import { NDKEvent } from '@nostr-dev-kit/ndk'

// WebRTC configuration
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
]

const PEER_CONNECTION_CONFIG: RTCConfiguration = {
  iceServers: DEFAULT_ICE_SERVERS,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
}

// Constants
const CALL_TIMEOUT = 30000 // 30 seconds
const ICE_CANDIDATE_BATCH_TIME = 100 // ms
const MAX_CALL_HISTORY = 100

// State
let currentCallId: string | null = null
let peerConnection: RTCPeerConnection | null = null
let localStream: MediaStream | null = null
let iceCandidateBuffer: RTCIceCandidate[] = []
let iceSendTimer: number | null = null
let callTimeoutTimer: number | null = null

/**
 * Generate unique call ID
 */
function generateCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Initiate a voice call to a recipient
 */
export async function initiateCall(recipientPubkey: string): Promise<string> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      throw new Error('Not authenticated')
    }

    // Check if already in call
    if (get(activeCall)) {
      throw new Error('Already in a call')
    }

    callLoading.set(true)
    callError.set(null)

    const callId = generateCallId()
    currentCallId = callId

    // Get audio stream
    console.log('📞 Requesting audio permission...')
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
    localStream = stream

    // Setup peer connection
    console.log('📞 Setting up peer connection...')
    peerConnection = new RTCPeerConnection(PEER_CONNECTION_CONFIG)
    setupPeerConnectionHandlers(peerConnection, callId)

    // Add audio tracks
    stream.getTracks().forEach(track => {
      if (peerConnection) {
        peerConnection.addTrack(track, stream)
      }
    })

    // Create offer
    console.log('📞 Creating SDP offer...')
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    })
    await peerConnection.setLocalDescription(offer)

    // Get recipient metadata
    const cache = get(metadataCache)
    const recipientMetadata = cache.get(recipientPubkey)

    // Create call request event
    console.log('📞 Sending call request...')
    await publishCallRequest(callId, recipientPubkey, offer)

    // Update active call state
    activeCall.set({
      id: callId,
      type: 'outgoing',
      participantPubkey: recipientPubkey,
      participantName: recipientMetadata?.name || recipientPubkey.slice(0, 8),
      participantAvatar: recipientMetadata?.picture,
      state: 'ringing',
      startTime: 0,
      initiatedAt: Date.now(),
      duration: 0,
      audioEnabled: true,
      videoEnabled: false,
      peerConnection,
      localStream,
    })

    // Set call timeout
    callTimeoutTimer = window.setTimeout(() => {
      if (get(activeCall)?.state === 'ringing') {
        void declineCall(callId, 'timeout')
      }
    }, CALL_TIMEOUT)

    console.log('✓ Call request sent:', callId)
    return callId
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to initiate call'
    console.error('✗ Call initiation failed:', errorMsg)
    callError.set(errorMsg)
    await cleanupCall()
    throw err
  } finally {
    callLoading.set(false)
  }
}

/**
 * Accept incoming call
 */
export async function acceptCall(callId: string): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      throw new Error('Not authenticated')
    }

    callLoading.set(true)
    callError.set(null)

    const incoming = get(incomingCall)
    if (!incoming || incoming.callId !== callId) {
      throw new Error('Invalid incoming call')
    }

    console.log('📞 Accepting call:', callId)

    // Get audio stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
    localStream = stream

    // Setup peer connection
    peerConnection = new RTCPeerConnection(PEER_CONNECTION_CONFIG)
    setupPeerConnectionHandlers(peerConnection, callId)

    // Add audio tracks
    stream.getTracks().forEach(track => {
      if (peerConnection) {
        peerConnection.addTrack(track, stream)
      }
    })

    // Update active call state
    const cache = get(metadataCache)
    const callerMetadata = cache.get(incoming.callerPubkey)

    activeCall.set({
      id: callId,
      type: 'incoming',
      participantPubkey: incoming.callerPubkey,
      participantName: callerMetadata?.name || incoming.callerName,
      participantAvatar: callerMetadata?.picture || incoming.callerAvatar,
      state: 'connecting',
      startTime: Date.now(),
      initiatedAt: incoming.initiatedAt,
      duration: 0,
      audioEnabled: true,
      videoEnabled: false,
      peerConnection,
      localStream,
    })

    // Clear incoming call
    incomingCall.set(null)

    // Publish call accepted event
    console.log('📞 Sending call accepted...')
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    })
    await peerConnection.setLocalDescription(offer)

    await publishCallAccepted(callId, incoming.callerPubkey, offer)

    console.log('✓ Call accepted:', callId)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to accept call'
    console.error('✗ Accept call failed:', errorMsg)
    callError.set(errorMsg)
    await cleanupCall()
    throw err
  } finally {
    callLoading.set(false)
  }
}

/**
 * Decline incoming call
 */
export async function declineCall(callId: string, reason: string = 'user-declined'): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) return

    console.log('📞 Declining call:', callId, 'reason:', reason)

    const incoming = get(incomingCall)
    if (incoming?.callId === callId) {
      // Publish call declined event
      await publishCallDeclined(callId, incoming.callerPubkey, reason as any)
      incomingCall.set(null)
    }

    // If this is the active call, end it
    const active = get(activeCall)
    if (active?.id === callId) {
      await endCall(callId)
    }

    console.log('✓ Call declined:', callId)
  } catch (err) {
    console.error('✗ Decline call failed:', err)
  }
}

/**
 * End active call
 */
export async function endCall(callId: string): Promise<void> {
  try {
    const call = get(activeCall)
    if (!call || call.id !== callId) return

    console.log('📞 Ending call:', callId)

    const duration = Math.floor((Date.now() - call.initiatedAt) / 1000)

    // Publish call ended event
    const user = getCurrentNDKUser()
    if (user?.pubkey) {
      await publishCallEnded(callId, call.participantPubkey, duration)
    }

    // Add to history
    addCallToHistory({
      id: callId,
      type: call.type,
      participantPubkey: call.participantPubkey,
      participantName: call.participantName,
      participantAvatar: call.participantAvatar,
      startTime: call.initiatedAt,
      endTime: Date.now(),
      duration,
      status: call.state === 'connected' ? 'completed' : 'failed',
      failureReason: call.failureReason,
    })

    await cleanupCall()
    console.log('✓ Call ended:', callId)
  } catch (err) {
    console.error('✗ End call failed:', err)
  }
}

/**
 * Toggle audio on/off
 */
export async function toggleAudio(enabled: boolean): Promise<void> {
  try {
    if (!localStream) return

    localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled
    })

    activeCall.update(call => {
      if (call) {
        call.audioEnabled = enabled
      }
      return call
    })

    console.log('🔊 Audio', enabled ? 'enabled' : 'disabled')
  } catch (err) {
    console.error('✗ Toggle audio failed:', err)
  }
}

/**
 * Handle incoming call event
 */
export async function handleIncomingCallRequest(event: NostrEvent): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) return

    // Parse event
    const content = JSON.parse(event.content) as CallEventContent
    if (content.type !== 'call-request') return

    const callId = content.callId
    const callerPubkey = event.pubkey

    console.log('📞 Incoming call from:', callerPubkey.slice(0, 8))

    // Check if already in call
    if (get(activeCall)) {
      console.log('📞 Declining - already in call')
      await publishCallDeclined(callId, callerPubkey, 'busy')
      return
    }

    // Get caller metadata
    const cache = get(metadataCache)
    const callerMetadata = cache.get(callerPubkey)

    // Show incoming call alert
    incomingCall.set({
      callId,
      callerPubkey,
      callerName: callerMetadata?.name || callerPubkey.slice(0, 8),
      callerAvatar: callerMetadata?.picture,
      initiatedAt: Date.now(),
      timeout: Date.now() + CALL_TIMEOUT,
    })

    console.log('✓ Incoming call alert shown:', callId)
  } catch (err) {
    console.error('✗ Handle incoming call failed:', err)
  }
}

/**
 * Handle call accepted event
 */
export async function handleCallAccepted(event: NostrEvent): Promise<void> {
  try {
    const content = JSON.parse(event.content) as CallEventContent
    if (content.type !== 'call-accepted') return

    const callId = content.callId
    if (callId !== currentCallId) return

    console.log('📞 Call accepted by recipient')

    if (!peerConnection) {
      throw new Error('Peer connection not initialized')
    }

    // Set remote description
    const answer = new RTCSessionDescription({
      type: 'answer',
      sdp: content.sdpAnswer,
    })
    await peerConnection.setRemoteDescription(answer)

    // Update state
    activeCall.update(call => {
      if (call) {
        call.state = 'connecting'
        call.startTime = Date.now()
      }
      return call
    })

    console.log('✓ Call accepted:', callId)
  } catch (err) {
    console.error('✗ Handle call accepted failed:', err)
  }
}

/**
 * Handle ICE candidate event
 */
export async function handleICECandidate(event: NostrEvent): Promise<void> {
  try {
    const content = JSON.parse(event.content) as CallEventContent
    if (content.type !== 'ice-candidate') return

    if (!peerConnection) return

    const candidate = new RTCIceCandidate({
      candidate: content.candidate,
      sdpMLineIndex: content.sdpMLineIndex,
      sdpMid: content.sdpMid,
    })

    await peerConnection.addIceCandidate(candidate)
    console.log('📞 Added ICE candidate')
  } catch (err) {
    console.error('✗ Handle ICE candidate failed:', err)
  }
}

/**
 * Handle call declined event
 */
export async function handleCallDeclined(event: NostrEvent): Promise<void> {
  try {
    const content = JSON.parse(event.content) as CallEventContent
    if (content.type !== 'call-declined') return

    const callId = content.callId
    if (callId !== currentCallId) return

    console.log('📞 Call declined:', content.reason)

    const reasonMap: Record<string, string> = {
      'user-declined': 'User declined',
      timeout: 'No answer',
      busy: 'User is busy',
      error: 'Connection error',
    }

    callError.set(reasonMap[content.reason] || 'Call declined')
    await endCall(callId)
  } catch (err) {
    console.error('✗ Handle call declined failed:', err)
  }
}

/**
 * Setup peer connection event handlers
 */
function setupPeerConnectionHandlers(pc: RTCPeerConnection, callId: string): void {
  // ICE candidate
  pc.onicecandidate = async event => {
    if (event.candidate) {
      iceCandidateBuffer.push(event.candidate)

      // Batch send ICE candidates
      if (iceSendTimer !== null) {
        clearTimeout(iceSendTimer)
      }
      iceSendTimer = window.setTimeout(async () => {
        const call = get(activeCall)
        if (call && iceCandidateBuffer.length > 0) {
          for (const candidate of iceCandidateBuffer) {
            await publishICECandidate(callId, call.participantPubkey, candidate)
          }
          iceCandidateBuffer = []
        }
      }, ICE_CANDIDATE_BATCH_TIME)
    }
  }

  // Connection state change
  pc.onconnectionstatechange = () => {
    console.log('📞 Connection state:', pc.connectionState)

    if (pc.connectionState === 'connected') {
      activeCall.update(call => {
        if (call) {
          call.state = 'connected'
          call.startTime = Date.now()
        }
        return call
      })
    } else if (pc.connectionState === 'failed') {
      activeCall.update(call => {
        if (call) {
          call.state = 'failed'
          call.failureReason = 'Connection failed'
        }
        return call
      })
      void endCall(callId)
    } else if (pc.connectionState === 'disconnected') {
      console.warn('📞 Connection disconnected')
    }
  }

  // ICE connection state
  pc.oniceconnectionstatechange = () => {
    console.log('📞 ICE connection state:', pc.iceConnectionState)

    if (pc.iceConnectionState === 'failed') {
      console.error('📞 ICE connection failed')
      activeCall.update(call => {
        if (call) {
          call.state = 'failed'
          call.failureReason = 'ICE connection failed'
        }
        return call
      })
      void endCall(callId)
    }
  }

  // Remote track
  pc.ontrack = event => {
    console.log('📞 Received remote track:', event.track.kind)

    activeCall.update(call => {
      if (call) {
        call.remoteStream = event.streams[0]
      }
      return call
    })

    // Play remote audio
    if (event.track.kind === 'audio') {
      const audio = new Audio()
      audio.srcObject = event.streams[0]
      audio.play().catch(err => console.error('Failed to play audio:', err))
    }
  }

  // Error
  pc.onerror = event => {
    console.error('📞 Peer connection error:', event)
  }
}

/**
 * Cleanup call resources
 */
async function cleanupCall(): Promise<void> {
  try {
    // Clear timers
    if (callTimeoutTimer) {
      clearTimeout(callTimeoutTimer)
      callTimeoutTimer = null
    }
    if (iceSendTimer) {
      clearTimeout(iceSendTimer)
      iceSendTimer = null
    }

    // Close peer connection
    if (peerConnection) {
      peerConnection.close()
      peerConnection = null
    }

    // Stop audio tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      localStream = null
    }

    // Clear state
    currentCallId = null
    iceCandidateBuffer = []

    // Update stores
    activeCall.set(null)
    incomingCall.set(null)
    callError.set(null)

    console.log('✓ Call cleanup complete')
  } catch (err) {
    console.error('✗ Cleanup failed:', err)
  }
}

/**
 * Publish call request event
 */
async function publishCallRequest(
  callId: string,
  recipientPubkey: string,
  offer: RTCSessionDescription
): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const ndk = getNDK()
  if (!ndk.signer) throw new Error('No signer available')

  const content: CallEventContent = {
    type: 'call-request',
    callId,
    timestamp: Date.now(),
  }

  const event = new NDKEvent(ndk, {
    kind: CALL_EVENT_KINDS.REQUEST,
    content: JSON.stringify(content),
    tags: [['p', recipientPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  })

  await event.sign(ndk.signer)
  await event.publish()
}

/**
 * Publish call accepted event
 */
async function publishCallAccepted(
  callId: string,
  recipientPubkey: string,
  offer: RTCSessionDescription
): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const ndk = getNDK()
  if (!ndk.signer) throw new Error('No signer available')

  const content: CallEventContent = {
    type: 'call-accepted',
    callId,
    sdpOffer: offer.sdp || '',
    timestamp: Date.now(),
  }

  const event = new NDKEvent(ndk, {
    kind: CALL_EVENT_KINDS.ACCEPTED,
    content: JSON.stringify(content),
    tags: [['p', recipientPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  })

  await event.sign(ndk.signer)
  await event.publish()
}

/**
 * Publish ICE candidate event
 */
async function publishICECandidate(
  callId: string,
  recipientPubkey: string,
  candidate: RTCIceCandidate
): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const ndk = getNDK()
  if (!ndk.signer) throw new Error('No signer available')

  const content: CallEventContent = {
    type: 'ice-candidate',
    callId,
    candidate: candidate.candidate || '',
    sdpMLineIndex: candidate.sdpMLineIndex || 0,
    sdpMid: candidate.sdpMid || undefined,
    timestamp: Date.now(),
  }

  const event = new NDKEvent(ndk, {
    kind: CALL_EVENT_KINDS.ICE_CANDIDATE,
    content: JSON.stringify(content),
    tags: [['p', recipientPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  })

  await event.sign(ndk.signer)
  await event.publish()
}

/**
 * Publish call declined event
 */
async function publishCallDeclined(
  callId: string,
  recipientPubkey: string,
  reason: 'user-declined' | 'timeout' | 'busy' | 'error'
): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const ndk = getNDK()
  if (!ndk.signer) throw new Error('No signer available')

  const content: CallEventContent = {
    type: 'call-declined',
    callId,
    reason,
    timestamp: Date.now(),
  }

  const event = new NDKEvent(ndk, {
    kind: CALL_EVENT_KINDS.DECLINED,
    content: JSON.stringify(content),
    tags: [['p', recipientPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  })

  await event.sign(ndk.signer)
  await event.publish()
}

/**
 * Publish call ended event
 */
async function publishCallEnded(
  callId: string,
  recipientPubkey: string,
  duration: number
): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const ndk = getNDK()
  if (!ndk.signer) throw new Error('No signer available')

  const content: CallEventContent = {
    type: 'call-ended',
    callId,
    duration,
    timestamp: Date.now(),
  }

  const event = new NDKEvent(ndk, {
    kind: CALL_EVENT_KINDS.ENDED,
    content: JSON.stringify(content),
    tags: [['p', recipientPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  })

  await event.sign(ndk.signer)
  await event.publish()
}

export { cleanupCall }
