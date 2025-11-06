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

  return {
    text: content,
    mentions,
    images,
    videos,
    quotes,
    embeds,
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
