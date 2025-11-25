<script lang="ts">
  import { metadataCache } from '$stores/feed'
  import { getDisplayName } from '$lib/metadata'
  import type { NostrEvent } from '$types/nostr'

  export let text: string
  export let event: NostrEvent
  export let onProfileClick: ((pubkey: string) => void) | undefined = undefined

  // Get p-tags from event
  const pTags = event.tags?.filter(t => t[0] === 'p' && t[1]) || []
  const mentionedPubkeys = new Set(pTags.map(t => t[1]))

  // Parse text and render mentions
  function renderTextWithMentions(content: string): (string | { type: 'mention'; pubkey: string; name: string })[] {
    const parts: (string | { type: 'mention'; pubkey: string; name: string })[] = []

    // Match @name patterns (word characters, numbers, underscores)
    const mentionRegex = /@([a-zA-Z0-9_]+)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionName = match[1]

      // Skip if it's an npub/nprofile (handled elsewhere)
      if (mentionName.startsWith('npub1') || mentionName.startsWith('nprofile1')) {
        continue
      }

      // Add text before mention
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index))
      }

      // Try to find matching pubkey from p-tags by checking metadata
      let matchedPubkey: string | null = null
      for (const pubkey of mentionedPubkeys) {
        const metadata = $metadataCache.get(pubkey)
        const displayName = getDisplayName(pubkey, metadata)

        if (displayName.toLowerCase() === mentionName.toLowerCase() ||
            metadata?.name?.toLowerCase() === mentionName.toLowerCase() ||
            metadata?.display_name?.toLowerCase() === mentionName.toLowerCase()) {
          matchedPubkey = pubkey
          break
        }
      }

      if (matchedPubkey) {
        // Add as clickable mention
        parts.push({
          type: 'mention',
          pubkey: matchedPubkey,
          name: mentionName
        })
      } else {
        // No match found, keep as plain text
        parts.push(`@${mentionName}`)
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex))
    }

    return parts.length > 0 ? parts : [content]
  }

  $: renderedParts = renderTextWithMentions(text)
</script>

<span>
  {#each renderedParts as part}
    {#if typeof part === 'string'}
      {part}
    {:else if part.type === 'mention'}
      <button
        type="button"
        class="text-primary hover:underline font-medium"
        on:click|stopPropagation={() => onProfileClick?.(part.pubkey)}
      >
        @{part.name}
      </button>
    {/if}
  {/each}
</span>
