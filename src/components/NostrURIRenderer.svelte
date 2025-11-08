<script lang="ts">
  import {
    extractNostrURIs,
    parseNostrURI,
    getEventIdFromURI,
    getPubkeyFromURI,
    type NostrURI,
  } from '$lib/nostr-uri'

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
      return `📝 Note ${eventId?.slice(0, 8) ?? 'unknown'}...`
    } else if (uri.type === 'npub' || uri.type === 'nprofile') {
      return `👤 User ${pubkey?.slice(0, 8) ?? 'unknown'}...`
    } else if (uri.type === 'naddr') {
      return `📄 Article`
    }
    return '🔗 Link'
  }
</script>

<!-- Render text with inline URI buttons -->
{#each parts as part (part.content)}
  {#if part.type === 'text'}
    <span>{part.content}</span>
  {:else if part.uri && part.type === 'uri'}
    <button
      type="button"
      on:click|stopPropagation={() => {
        if (part.uri) {
          handleURIClick(part.uri)
        }
      }}
      class="inline-block rounded-lg border border-primary/40 bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary transition-all duration-200 hover:border-primary/60 hover:bg-primary/15 hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      title={part.content}
    >
      {#if part.uri}
        {getURILabel(part.uri)}
      {/if}
    </button>
  {/if}
{/each}
