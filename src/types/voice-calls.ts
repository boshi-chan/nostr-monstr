/**
 * Voice Calls Type Definitions
 * Nostr-based peer-to-peer voice calling
 */

export type CallState = 'ringing' | 'connecting' | 'connected' | 'on-hold' | 'ended' | 'failed'
export type CallType = 'incoming' | 'outgoing'

/**
 * Active call information
 */
export interface ActiveCall {
  id: string
  type: CallType
  participantPubkey: string
  participantName: string
  participantAvatar?: string
  state: CallState
  startTime: number // When call started (connected state)
  initiatedAt: number // When call was initiated (ringing state)
  duration: number // In seconds
  audioEnabled: boolean
  videoEnabled: boolean
  peerConnection?: RTCPeerConnection
  localStream?: MediaStream
  remoteStream?: MediaStream
  dataChannel?: RTCDataChannel
  failureReason?: string
}

/**
 * Incoming call alert (before user accepts/declines)
 */
export interface IncomingCallAlert {
  callId: string
  callerPubkey: string
  callerName: string
  callerAvatar?: string
  initiatedAt: number
  timeout: number // When to auto-decline (30 seconds)
}

/**
 * Call history record
 */
export interface CallRecord {
  id: string
  type: CallType
  participantPubkey: string
  participantName: string
  participantAvatar?: string
  startTime: number
  endTime: number
  duration: number // In seconds
  status: 'completed' | 'missed' | 'declined' | 'failed'
  failureReason?: string
}

/**
 * Nostr event content for call signaling
 */
export interface CallRequestContent {
  type: 'call-request'
  callId: string
  timestamp: number
}

export interface CallAcceptedContent {
  type: 'call-accepted'
  callId: string
  sdpOffer: string // SDP offer from caller
  timestamp: number
}

export interface CallAnswerContent {
  type: 'call-answer'
  callId: string
  sdpAnswer: string // SDP answer from callee
  timestamp: number
}

export interface ICECandidateContent {
  type: 'ice-candidate'
  callId: string
  candidate: string // ICE candidate JSON
  sdpMLineIndex: number
  sdpMid?: string
  timestamp: number
}

export interface CallDeclinedContent {
  type: 'call-declined'
  callId: string
  reason: 'user-declined' | 'timeout' | 'busy' | 'error'
  timestamp: number
}

export interface CallEndedContent {
  type: 'call-ended'
  callId: string
  duration: number // In seconds
  timestamp: number
}

export type CallEventContent =
  | CallRequestContent
  | CallAcceptedContent
  | CallAnswerContent
  | ICECandidateContent
  | CallDeclinedContent
  | CallEndedContent

/**
 * Call event kinds (Nostr)
 */
export const CALL_EVENT_KINDS = {
  REQUEST: 1100, // Call request
  ACCEPTED: 1101, // Call accepted
  ANSWER: 1102, // Call answer (SDP answer)
  ICE_CANDIDATE: 1103, // ICE candidate
  DECLINED: 1104, // Call declined
  ENDED: 1105, // Call ended
} as const

/**
 * WebRTC configuration
 */
export interface WebRTCConfig {
  iceServers: RTCIceServer[]
  iceTransportPolicy: RTCIceTransportPolicy
  bundlePolicy: RTCBundlePolicy
  rtcpMuxPolicy: RTCRtcpMuxPolicy
}

/**
 * Call statistics
 */
export interface CallStats {
  audioLevel: number // 0-100
  audioCodec: string
  bytesReceived: number
  bytesSent: number
  packetsLost: number
  roundTripTime: number // In milliseconds
  jitter: number
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
}

/**
 * Call configuration options
 */
export interface CallConfig {
  autoAcceptFromFollowing?: boolean // Auto-accept calls from users you follow
  callTimeout?: number // Seconds before auto-decline (default 30)
  enableVideo?: boolean // Allow video calls (future)
  enableScreenShare?: boolean // Allow screen sharing (future)
  recordCalls?: boolean // Record calls locally (future)
  stunServers?: string[] // Custom STUN servers
  turnServers?: Array<{ url: string; username?: string; credential?: string }>
}

/**
 * Call error types
 */
export enum CallError {
  NO_AUDIO_PERMISSION = 'no-audio-permission',
  PEER_CONNECTION_FAILED = 'peer-connection-failed',
  ICE_CONNECTION_FAILED = 'ice-connection-failed',
  NETWORK_ERROR = 'network-error',
  TIMEOUT = 'timeout',
  USER_DECLINED = 'user-declined',
  ALREADY_IN_CALL = 'already-in-call',
  INVALID_RECIPIENT = 'invalid-recipient',
  NOT_AUTHENTICATED = 'not-authenticated',
  RELAY_ERROR = 'relay-error',
  UNKNOWN = 'unknown',
}
