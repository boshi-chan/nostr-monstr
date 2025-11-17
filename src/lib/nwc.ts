/**
 * Nostr Wallet Connect (NWC) implementation
 * NIP-47: https://github.com/nostr-protocol/nips/blob/master/47.md
 */

import { get } from 'svelte/store'
import { nwcConnection, ensureNwcUnlocked } from '$stores/nwc'
import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import { NDKEvent, NDKRelaySet, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { fetchUserMetadata, getUserMetadata } from '$lib/metadata'

interface NWCRequest {
  method: string
  params: Record<string, any>
}

interface NWCResponse {
  result_type: string
  result?: Record<string, any>
  error?: {
    code: string
    message: string
  }
}

/**
 * Send an encrypted NWC request and wait for response
 */
async function sendNWCRequest(request: NWCRequest): Promise<NWCResponse> {
  if (!(await ensureNwcUnlocked({ silent: false }))) {
    throw new Error('Unlock your Lightning wallet to continue')
  }
  const conn = get(nwcConnection)
  if (!conn) {
    throw new Error('No NWC connection configured')
  }

  const ndk = getNDK()

  // Ensure NWC relay is connected
  const nwcRelay = ndk.pool.getRelay(conn.relay)
  if (nwcRelay && !nwcRelay.connectivity.status) {
    await nwcRelay.connect()
  }

  // Create a signer from the NWC secret (which is a hex private key)
  const nwcSigner = new NDKPrivateKeySigner(conn.secret)

  // Create encrypted request using NWC secret to encrypt to wallet pubkey
  const walletUser = ndk.getUser({ pubkey: conn.walletPubkey })
  const requestContent = JSON.stringify(request)
  const encryptedContent = await nwcSigner.encrypt(walletUser, requestContent)

  // Create NWC request event (kind 23194)
  const requestEvent = new NDKEvent(ndk)
  requestEvent.kind = 23194
  requestEvent.content = encryptedContent
  requestEvent.tags = [['p', conn.walletPubkey]]
  requestEvent.created_at = Math.floor(Date.now() / 1000)

  // Sign with NWC secret
  await requestEvent.sign(nwcSigner)

  // Listen for response before publishing
  return new Promise((resolve, reject) => {
    let responseReceived = false

    const timeout = setTimeout(() => {
      if (!responseReceived) {
        sub.stop()
        reject(new Error('NWC request timeout - wallet may be offline'))
      }
    }, 30000) // 30 second timeout

    // Subscribe on the NWC relay specifically
    const relaySet = NDKRelaySet.fromRelayUrls([conn.relay], ndk)
    const sub = ndk.subscribe(
      {
        kinds: [23195], // NWC response kind
        authors: [conn.walletPubkey],
        '#e': [requestEvent.id!],
        since: Math.floor(Date.now() / 1000) - 5, // Look back 5 seconds
      },
      {
        closeOnEose: false,
        relaySet: relaySet
      }
    )

    sub.on('event', async (event: any) => {
      try {
        if (responseReceived) return
        responseReceived = true

        clearTimeout(timeout)

        // Decrypt response using NWC secret
        const nwcSigner = new NDKPrivateKeySigner(conn.secret)
        const walletUser = ndk.getUser({ pubkey: conn.walletPubkey })
        const decryptedContent = await nwcSigner.decrypt(walletUser, event.content)

        const response: NWCResponse = JSON.parse(decryptedContent)

        sub.stop()

        if (response.error) {
          reject(new Error(response.error.message || 'NWC request failed'))
        } else {
          resolve(response)
        }
      } catch (err) {
        if (!responseReceived) {
          responseReceived = true
          clearTimeout(timeout)
          sub.stop()
          reject(err)
        }
      }
    })

    // Publish request after listener is set up
    requestEvent.publish(relaySet).catch(err => {
      if (!responseReceived) {
        responseReceived = true
        clearTimeout(timeout)
        sub.stop()
        reject(new Error('Failed to publish NWC request: ' + err.message))
      }
    })
  })
}

/**
 * Get recipient's Lightning address or LNURL
 */
async function getRecipientLNURL(pubkey: string): Promise<string | null> {
  // Try to get from cache first
  let metadata = getUserMetadata(pubkey)

  if (!metadata) {
    // Fetch metadata if not cached
    await fetchUserMetadata(pubkey)
    metadata = getUserMetadata(pubkey)
  }

  if (!metadata) return null

  // Check for Lightning address (most common)
  if (metadata.lud16) {
    return metadata.lud16
  }

  // Check for LNURL
  if (metadata.lud06) {
    return metadata.lud06
  }

  return null
}

/**
 * Send a zap payment via NWC
 */
export async function sendZap(
  eventId: string,
  recipientPubkey: string,
  amountSats: number,
  comment?: string
): Promise<void> {
  const conn = get(nwcConnection)
  if (!conn) {
    throw new Error('No NWC connection configured')
  }

  const user = getCurrentNDKUser()
  if (!user?.pubkey) {
    throw new Error('Not authenticated')
  }

  // Get recipient's Lightning address
  const lnurl = await getRecipientLNURL(recipientPubkey)
  if (!lnurl) {
    throw new Error('Recipient has no Lightning address configured')
  }

  // Create zap request (kind 9734)
  const ndk = getNDK()
  const zapRequest = new NDKEvent(ndk)
  zapRequest.kind = 9734
  zapRequest.content = comment || ''
  zapRequest.tags = [
    ['p', recipientPubkey],
    ['e', eventId],
    ['amount', String(amountSats * 1000)], // Convert sats to millisats
    ['relays', 'wss://relay.damus.io', 'wss://nos.lol'],
  ]
  zapRequest.created_at = Math.floor(Date.now() / 1000)

  await zapRequest.sign()

  // Serialize zap request for invoice
  const zapRequestJson = JSON.stringify({
    id: zapRequest.id,
    pubkey: zapRequest.pubkey,
    created_at: zapRequest.created_at,
    kind: zapRequest.kind,
    tags: zapRequest.tags,
    content: zapRequest.content,
    sig: zapRequest.sig,
  })

  // Request invoice from LNURL service
  let invoice: string
  try {
    // For Lightning address (user@domain.com)
    if (lnurl.includes('@')) {
      const [name, domain] = lnurl.split('@')
      const lnurlUrl = `https://${domain}/.well-known/lnurlp/${name}`

      const lnurlResponse = await fetch(lnurlUrl)
      if (!lnurlResponse.ok) {
        throw new Error('Failed to fetch LNURL endpoint')
      }

      const lnurlData = await lnurlResponse.json()
      const callbackUrl = lnurlData.callback

      if (!callbackUrl) {
        throw new Error('No callback URL in LNURL response')
      }

      // Request invoice with zap request
      const invoiceUrl = `${callbackUrl}?amount=${amountSats * 1000}&nostr=${encodeURIComponent(zapRequestJson)}`
      const invoiceResponse = await fetch(invoiceUrl)

      if (!invoiceResponse.ok) {
        throw new Error('Failed to get invoice from LNURL service')
      }

      const invoiceData = await invoiceResponse.json()
      invoice = invoiceData.pr

      if (!invoice) {
        throw new Error('No invoice returned from LNURL service')
      }
    } else {
      // Handle bech32 LNURL (lnurl...)
      throw new Error('bech32 LNURL not yet supported, please use Lightning address')
    }
  } catch (err) {
    logger.error('LNURL/invoice error:', err)
    throw new Error('Failed to get Lightning invoice: ' + (err instanceof Error ? err.message : String(err)))
  }

  // Pay invoice via NWC
  try {
    const response = await sendNWCRequest({
      method: 'pay_invoice',
      params: {
        invoice,
      },
    })

    if (response.error) {
      throw new Error(response.error.message)
    }

    logger.info('Zap sent successfully:', response)
  } catch (err) {
    logger.error('NWC payment error:', err)
    throw new Error('Failed to send payment: ' + (err instanceof Error ? err.message : String(err)))
  }
}

/**
 * Get wallet balance via NWC
 */
export async function getNWCBalance(): Promise<number> {
  try {
    const response = await sendNWCRequest({
      method: 'get_balance',
      params: {},
    })

    if (response.result?.balance) {
      // Balance is in millisats, convert to sats
      return Math.floor(response.result.balance / 1000)
    }

    return 0
  } catch (err) {
    logger.error('Failed to get NWC balance:', err)
    throw err
  }
}

/**
 * Get wallet info via NWC
 */
export async function getNWCInfo(): Promise<Record<string, any>> {
  try {
    const response = await sendNWCRequest({
      method: 'get_info',
      params: {},
    })

    return response.result || {}
  } catch (err) {
    logger.error('Failed to get NWC info:', err)
    throw err
  }
}

