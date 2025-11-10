<script lang="ts">
  import {
    extractNostrURIs,
    parseNostrURI,
    getEventIdFromURI,
    getPubkeyFromURI,
    type NostrURI,
  } from '$lib/nostr-uri'
  import { metadataCache } from '$stores/feed'
  import { getDisplayName } from '$lib/metadata'

  export let text: string
  export let onEventClick: ((eventId: string) => void) | undefined = undefined
  export let onProfileClick: ((pubkey: string) => void) | undefined = undefined

  interface TextPart {
    type: 'text' | 'uri'
    content: string
    uri?: NostrURI | null
  }

  let parts: TextPart[] = []

  $: {
    parts = []
    const uriStrings = extractNostrURIs(text)
    const uriSet = new Set(uriStrings)

    if (uriSet.size === 0) {
      // No URIs, just plain text
      parts = [{ type: 'text', content: text, uri: null }]
    } else {
      // Split text by URIs
      let remaining = text

      for (const uriString of uriSet) {
        const index = remaining.indexOf(uriString)
        if (index === -1) continue

        // Add text before URI
        if (index > 0) {
          parts.push({
            type: 'text',
            content: remaining.substring(0, index),
            uri: null,
          })
        }

        // Add URI
        const parsed = parseNostrURI(uriString)
        if (parsed) {
          parts.push({
            type: 'uri',
            content: uriString,
            uri: parsed,
          })
        } else {
          parts.push({
            type: 'text',
            content: uriString,
            uri: null,
          })
        }

        remaining = remaining.substring(index + uriString.length)
      }

      // Add remaining text
      if (remaining) {
        parts.push({
          type: 'text',
          content: remaining,
          uri: null,
        })
      }
    }
  }

  function handleURIClick(uri: NostrURI): void {
    const eventId = getEventIdFromURI(uri)
    const pubkey = getPubkeyFromURI(uri)

    if (eventId && onEventClick) {
      onEventClick(eventId)
    } else if (pubkey && onProfileClick) {
      onProfileClick(pubkey)
    }
  }

  function getURILabel(uri: NostrURI): string {
    const eventId = getEventIdFromURI(uri)
    const pubkey = getPubkeyFromURI(uri)

    if (uri.type === 'note' || uri.type === 'nevent') {
      return `@${eventId?.slice(0, 8) ?? 'unknown'}`
    } else if (uri.type === 'npub' || uri.type === 'nprofile') {
      if (pubkey) {
        const metadata = $metadataCache.get(pubkey)
        const displayName = getDisplayName(pubkey, metadata)
        return `@${displayName}`
      }
      return `@${pubkey?.slice(0, 8) ?? 'unknown'}`
    } else if (uri.type === 'naddr') {
      return `@article`
    }
    return '@link'
  }
</script>

<!-- Render text with inline URI buttons -->
{#each parts as part (part.content)}
  {#if part.type === 'text'}
    <span>{part.content}</span>
  {:else if part.uri && part.type === 'uri'}
    {@const pubkey = getPubkeyFromURI(part.uri)}
    {@const metadata = pubkey ? $metadataCache.get(pubkey) : null}
    {@const displayName = pubkey ? getDisplayName(pubkey, metadata) : null}
    <button
      type="button"
      on:click|stopPropagation={() => {
        if (part.uri) {
          handleURIClick(part.uri)
        }
      }}
      class="text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-0.5 -mx-0.5"
      title={part.content}
    >
      {#if part.uri.type === 'npub' || part.uri.type === 'nprofile'}
        @{displayName || pubkey?.slice(0, 8) || 'unknown'}
      {:else}
        {getURILabel(part.uri)}
      {/if}
    </button>
  {/if}
{/each}
