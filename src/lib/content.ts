/**
 * Content rendering utilities
 * Handles media, mentions, quotes, embeds, etc.
 */

import type { NostrEvent } from '$types/nostr'

export interface ParsedContent {
  text: string
  mentions: Mention[]
  images: string[]
  videos: string[]
  quotes: string[] // Event IDs
  embeds: string[] // URLs
  nostrURIs: string[] // nostr: URIs (NIP-21)
  repostId: string | null
  nestedEvent: NostrEvent | null
  replyToId: string | null
  rootId: string | null
}

export interface Mention {
  pubkey: string
  name: string
  index: number
}

/**
 * Parse event content for media, mentions, and quotes
 */
export function parseContent(event: NostrEvent): ParsedContent {
  const images: string[] = []
  const videos: string[] = []
  const quotes: string[] = []
  const embeds: string[] = []
  const nostrURIs: string[] = []
  const mentions: Mention[] = []
  let repostId: string | null = null
  let nestedEvent: NostrEvent | null = null
  let replyToId: string | null = null
  let rootId: string | null = null

  let workingContent = event.content

  try {
    const parsed = JSON.parse(event.content)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.content === 'string' &&
      typeof parsed.pubkey === 'string' &&
      typeof parsed.id === 'string'
    ) {
      nestedEvent = {
        ...parsed,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      } as NostrEvent
      workingContent = nestedEvent.content

    }
  } catch {
    // ignore non-json payloads
  }

  // Extract quoted note IDs from tags
  const baseTags = Array.isArray(event.tags) ? (event.tags as string[][]) : []
  const nestedTags = nestedEvent && Array.isArray(nestedEvent.tags) ? (nestedEvent.tags as string[][]) : []

  let lastReferenceId: string | null = null

  const processTags = (tags: string[][], allowRepostCandidate: boolean) => {
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) continue
      const [type, value] = tag
      if (!value) continue
      if (type === 'e') {
        const markerRaw = tag[3] || tag[2] || ''
        const marker = markerRaw.toLowerCase()

        if (marker === 'root') {
          if (!rootId) {
            rootId = value
          }
          continue
        }

        if (marker === 'reply') {
          if (!replyToId) {
            replyToId = value
          }
          continue
        }

        if (marker === 'mention' || marker === 'quoted' || marker === 'quote') {
          quotes.push(value)
          continue
        }

        lastReferenceId = value

        if (!marker) {
          if (allowRepostCandidate && !repostId) {
            repostId = value
          } else {
            quotes.push(value)
          }
        }
      } else if (type === 'p') {
        mentions.push({
          pubkey: value,
          name: tag[2] || value.slice(0, 8),
          index: -1,
        })
      }
    }
  }

  processTags(baseTags, true)
  if (nestedTags.length > 0) {
    processTags(nestedTags, false)
  }

  if (!replyToId && lastReferenceId && lastReferenceId !== rootId) {
    replyToId = lastReferenceId
  }

  // Parse content for URLs and mentions
  const content = workingContent

  // Find image URLs
  const imageRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/gi
  let match
  while ((match = imageRegex.exec(content)) !== null) {
    images.push(match[0])
  }

  // Find video URLs
  const videoRegex = /https?:\/\/[^\s]+\.(mp4|webm|mov)/gi
  while ((match = videoRegex.exec(content)) !== null) {
    videos.push(match[0])
  }

  // Find other URLs (embeds)
  const urlRegex = /https?:\/\/[^\s]+/gi
  while ((match = urlRegex.exec(content)) !== null) {
    const url = match[0]
    // Skip if already in images or videos
    if (!images.includes(url) && !videos.includes(url)) {
      embeds.push(url)
    }
  }

  // Find mentions (@npub, @nprofile)
  const mentionRegex = /@(npub1|nprofile1)[a-z0-9]+/gi
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push({
      pubkey: match[1],
      name: match[1].slice(0, 8),
      index: match.index,
    })
  }

  // Find nostr: URIs (NIP-21) and bare NIP-19 identifiers
  // Matches both "nostr:nevent1..." and bare "nevent1..." formats
  const nostrURIRegex = /(?:nostr:)?(note1|nevent1|npub1|nprofile1|naddr1)[a-z0-9]+/gi
  while ((match = nostrURIRegex.exec(content)) !== null) {
    // Normalize to always include nostr: prefix for consistent handling
    const uri = match[0].startsWith('nostr:') ? match[0] : `nostr:${match[0]}`
    nostrURIs.push(uri)
  }

  return {
    text: content,
    mentions,
    images,
    videos,
    quotes,
    embeds,
    nostrURIs,
    repostId,
    nestedEvent,
    replyToId,
    rootId,
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const domain = new URL(url).hostname
    return domain.replace('www.', '')
  } catch {
    return url
  }
}

/**
 * Check if URL is an image
 */
export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(url)
}

/**
 * Check if URL is a video
 */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv)$/i.test(url)
}

/**
 * Get video thumbnail from URL
 */
export function getVideoThumbnail(url: string): string | null {
  // For YouTube
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1]
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  }
  
  // For Vimeo
  if (url.includes('vimeo.com')) {
    const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1]
    if (videoId) return `https://vimeo.com/api/v2/video/${videoId}.json`
  }
  
  return null
}

/**
 * Get embed metadata (og:title, og:image, etc.)
 */
export interface EmbedMetadata {
  title?: string
  description?: string
  image?: string
  domain: string
}

export function getEmbedMetadata(url: string): EmbedMetadata {
  return {
    domain: extractDomain(url),
  }
}

/**
 * Render mentions in text
 */
export function renderMentions(text: string, mentions: Mention[]): string {
  let result = text
  
  // Sort mentions by index (reverse) to maintain indices
  const sorted = [...mentions].sort((a, b) => b.index - a.index)
  
  for (const mention of sorted) {
    if (mention.index >= 0) {
      result = result.slice(0, mention.index) + `@${mention.name}` + result.slice(mention.index)
    }
  }
  
  return result
}

/**
 * Check if content is a repost/quote
 */
export function isQuote(event: NostrEvent): boolean {
  return event.kind === 1 && event.tags.some(tag => tag[0] === 'e')
}

/**
 * Get quoted event ID
 */
export function getQuotedEventId(event: NostrEvent): string | null {
  for (const tag of event.tags) {
    if (tag[0] === 'e' && tag[1]) {
      return tag[1]
    }
  }
  return null
}

/**
 * Check if event is a reply
 * A reply has 'e' tags with 'reply'/'root' marker, or 'e' tags without markers (positional reply)
 * This matches the logic in parseContent() for determining replyToId
 */
export function isReply(event: NostrEvent): boolean {
  if (!Array.isArray(event.tags)) return false

  // Don't treat reposts as replies
  if (isRepostEvent(event)) return false

  let hasReplyMarker = false
  let hasUnmarkedETag = false
  let eTagCount = 0

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue
    if (tag[0] === 'e' && tag[1]) {
      eTagCount++
      const marker = (tag[3] || tag[2] || '').toLowerCase()

      // Explicit reply or root marker
      if (marker === 'reply' || marker === 'root') {
        hasReplyMarker = true
      }

      // No marker - could be positional reply (but not if it's a quote/mention marker)
      if (!marker || (marker !== 'mention' && marker !== 'quoted' && marker !== 'quote')) {
        hasUnmarkedETag = true
      }
    }
  }

  // It's a reply if:
  // 1. Has explicit reply/root marker, OR
  // 2. Has unmarked e-tags (positional reply style)
  return hasReplyMarker || (hasUnmarkedETag && eTagCount > 0)
}

/**
 * Check if event is a repost (kind 6 or has repost pattern)
 */
export function isRepostEvent(event: NostrEvent): boolean {
  // Kind 6 is the official repost kind
  if (event.kind === 6) return true

  // Some clients use kind 1 with empty content and single 'e' tag
  if (event.kind === 1 && event.content.trim() === '') {
    const eTags = event.tags.filter(tag => Array.isArray(tag) && tag[0] === 'e' && tag[1])
    return eTags.length === 1
  }

  // Check for nested event (full repost in content)
  try {
    const parsed = JSON.parse(event.content)
    if (parsed && typeof parsed === 'object' && parsed.id && parsed.pubkey) {
      return true
    }
  } catch {
    // Not a repost
  }

  return false
}

/**
 * Check if event has NIP-36 content warning
 */
export function hasContentWarning(event: NostrEvent): boolean {
  if (!Array.isArray(event.tags)) return false

  return event.tags.some(
    tag => Array.isArray(tag) && tag[0] === 'content-warning'
  )
}

/**
 * Get content warning reason from NIP-36 tag
 */
export function getContentWarningReason(event: NostrEvent): string | null {
  if (!Array.isArray(event.tags)) return null

  for (const tag of event.tags) {
    if (Array.isArray(tag) && tag[0] === 'content-warning') {
      // Reason is the second element (optional)
      return tag[1] || null
    }
  }

  return null
}

/**
 * Get all content warning labels (including L/l tags from NIP-32)
 */
export function getContentWarningLabels(event: NostrEvent): string[] {
  if (!Array.isArray(event.tags)) return []

  const labels: string[] = []

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue

    // content-warning tag with reason
    if (tag[0] === 'content-warning' && tag[1]) {
      labels.push(tag[1])
    }

    // NIP-32 'l' tag with content-warning namespace
    if (tag[0] === 'l' && tag[1] && tag[2] === 'content-warning') {
      labels.push(tag[1])
    }
  }

  return labels
}

/**
 * Check if event has media (images or videos)
 */
export function hasMedia(event: NostrEvent): boolean {
  const parsed = parseContent(event)
  return parsed.images.length > 0 || parsed.videos.length > 0
}

/**
 * Check if event is from a bot
 * Detects bots by common patterns in content and metadata
 */
export function isBot(event: NostrEvent): boolean {
  // Check for bot indicators in content
  const content = event.content.toLowerCase()

  // Common bot patterns
  const botPatterns = [
    /\bbot\b/i,
    /automated/i,
    /rss feed/i,
    /crosspost/i,
    /🤖/,
  ]

  // Check if any bot pattern matches
  if (botPatterns.some(pattern => pattern.test(event.content))) {
    return true
  }

  // Check for bot-like posting patterns (very frequent posts)
  // This would require metadata lookup which we'll skip for now

  return false
}
