<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { walletState, showWallet } from '$stores/wallet'
  import { metadataCache } from '$stores/feed'
  import { getAvatarUrl, getNip05Display, fetchUserMetadata } from '$lib/metadata'
  import { setWalletSharePreference, getAvailableNodes, setActiveNode } from '$lib/wallet'
  import { getRelaysFromNIP65, publishRelays, getDefaultRelays, isValidRelayUrl, type RelayConfig } from '$lib/relays'
  import { updateProfileMetadata, type EditableProfileFields } from '$lib/profile'
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import UserIcon from '../icons/UserIcon.svelte'
  import ServerIcon from '../icons/ServerIcon.svelte'
  import EmberIcon from '../icons/EmberIcon.svelte'
  import ZapIcon from '../icons/ZapIcon.svelte'
  import type { MoneroNode } from '$lib/wallet/nodes'
  import { nwcConnection, nwcConnected, setNWCFromURI, disconnectNWC } from '$stores/nwc'
  import { getNWCBalance, getNWCInfo } from '$lib/nwc'

  type SettingsTab = 'profile' | 'relays' | 'wallet' | 'lightning'

  let activeTab: SettingsTab = 'profile'

  // Profile editor state
  let isEditingProfile = false
  let profileSaving = false
  let profileError: string | null = null
  let profileSuccess: string | null = null
  let profileDisplayNameInput = ''
  let profileUsernameInput = ''
  let profileAboutInput = ''
  let profileWebsiteInput = ''
  let profileNip05Input = ''
  let profileAvatarInput = ''
  let profileBannerInput = ''
  let profileLud16Input = ''
  let profileLud06Input = ''
  let profileMoneroAddressInput = ''

  // Wallet share preference mirror
  let shareAddress = false
  $: shareAddress = $walletState.shareAddress

  // Ensure the current user's metadata is loaded before showing settings
  $: if ($currentUser?.pubkey) {
    const cachedMetadata = $metadataCache.get($currentUser.pubkey)
    if (!cachedMetadata || Object.keys(cachedMetadata).length === 0) {
      void fetchUserMetadata($currentUser.pubkey)
    }
  }

  async function handleShareToggle(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    try {
      await setWalletSharePreference(input.checked)
    } catch (err) {
      console.error('Failed to update share preference', err)
      // Revert checkbox on error
      input.checked = !input.checked
    }
  }

  function resetProfileForm(): void {
    profileDisplayNameInput = ''
    profileUsernameInput = ''
    profileAboutInput = ''
    profileWebsiteInput = ''
    profileNip05Input = ''
    profileAvatarInput = ''
    profileBannerInput = ''
    profileLud16Input = ''
    profileLud06Input = ''
    profileMoneroAddressInput = ''
  }

  function hydrateProfileForm(): void {
    const user = get(currentUser)
    if (!user?.pubkey) {
      resetProfileForm()
      return
    }

    const metadata = get(metadataCache).get(user.pubkey)
    profileDisplayNameInput = metadata?.display_name ?? user.display_name ?? user.name ?? ''
    profileUsernameInput = metadata?.name ?? user.name ?? ''
    profileAboutInput = metadata?.about ?? ''
    profileWebsiteInput = metadata?.website ?? ''
    profileNip05Input = metadata?.nip05 ?? ''
    profileAvatarInput = metadata?.picture ?? ''
    profileBannerInput = metadata?.banner ?? ''
    profileLud16Input = metadata?.lud16 ?? ''
    profileLud06Input = metadata?.lud06 ?? ''
    profileMoneroAddressInput = metadata?.monero_address ?? ''
  }

  function startProfileEdit(): void {
    const user = get(currentUser)
    if (!user?.pubkey) {
      profileError = 'You must be logged in to edit your profile.'
      return
    }

    hydrateProfileForm()
    profileError = null
    profileSuccess = null
    isEditingProfile = true
  }

  function cancelProfileEdit(): void {
    resetProfileForm()
    profileError = null
    profileSuccess = null
    profileSaving = false
    isEditingProfile = false
  }

  function collectProfilePayload(): EditableProfileFields {
    return {
      display_name: profileDisplayNameInput,
      name: profileUsernameInput,
      about: profileAboutInput,
      website: profileWebsiteInput,
      nip05: profileNip05Input,
      picture: profileAvatarInput,
      banner: profileBannerInput,
      lud16: profileLud16Input,
      lud06: profileLud06Input,
      monero_address: profileMoneroAddressInput
    }
  }

  function normalizeProfileForm(form: EditableProfileFields): EditableProfileFields {
    const cleaned: EditableProfileFields = { ...form }
    const fields: (keyof EditableProfileFields)[] = [
      'display_name',
      'name',
      'about',
      'website',
      'nip05',
      'picture',
      'banner',
      'lud16',
      'lud06',
      'monero_address'
    ]

    for (const key of fields) {
      const value = cleaned[key]
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.length === 0) {
          delete cleaned[key]
        } else if (key === 'about') {
          cleaned[key] = trimmed
        } else {
          cleaned[key] = trimmed
        }
      }
    }

    if (cleaned.website) {
      const hasProtocol = /^https?:\/\//i.test(cleaned.website)
      cleaned.website = hasProtocol ? cleaned.website : `https://${cleaned.website}`
    }

    if (cleaned.nip05) {
      cleaned.nip05 = cleaned.nip05.toLowerCase()
    }

    return cleaned
  }

  function validateProfileForm(form: EditableProfileFields): string | null {
    if (form.display_name && form.display_name.length > 80) {
      return 'Display name must be 80 characters or less'
    }

    if (form.name && form.name.length > 64) {
      return 'Username must be 64 characters or less'
    }

    if (form.about && form.about.length > 1024) {
      return 'Bio must be 1024 characters or less'
    }

    if (form.website) {
      try {
        const url = new URL(form.website)
        if (!['http:', 'https:'].includes(url.protocol)) {
          return 'Website must use http or https'
        }
      } catch {
        return 'Website must be a valid URL'
      }
    }

    if (form.nip05 && !/^[^@]+@[^@]+\.[^@]+$/.test(form.nip05)) {
      return 'NIP-05 must look like user@example.com'
    }

    if (form.lud16 && !/^[^@]+@[^@]+\.[^@]+$/.test(form.lud16)) {
      return 'LUD-16 must look like user@example.com'
    }

    if (form.lud06 && !form.lud06.toLowerCase().startsWith('lnurl')) {
      return 'LUD-06 must start with lnurl'
    }

    if (form.monero_address && form.monero_address.length < 95) {
      return 'Monero addresses should be full-length subaddresses'
    }

    if (form.monero_address && !/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(form.monero_address)) {
      return 'Monero address can only contain Base58 characters'
    }

    return null
  }

  async function handleProfileSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (profileSaving) return

    const user = get(currentUser)
    if (!user?.pubkey) {
      profileError = 'You must be logged in to update your profile.'
      return
    }

    const payload = normalizeProfileForm(collectProfilePayload())
    const validationMessage = validateProfileForm(payload)
    if (validationMessage) {
      profileError = validationMessage
      return
    }

    try {
      profileSaving = true
      profileError = null
      profileSuccess = null

      await updateProfileMetadata(payload)

      profileSuccess = 'Profile updated and broadcast to relays.'
      isEditingProfile = false
      resetProfileForm()
      setTimeout(() => (profileSuccess = null), 4000)
    } catch (err) {
      profileError = err instanceof Error ? err.message : 'Failed to update profile'
    } finally {
      profileSaving = false
    }
  }

  // Relays state
  let relays: RelayConfig[] = []
  let newRelayUrl = ''
  let relayLoading = false
  let relayError: string | null = null
  let relaySuccess: string | null = null
  let showRelayForm = false

  onMount(async () => {
    await loadRelays()
  })

  async function loadRelays() {
    try {
      relayLoading = true
      relayError = null
      const fetchedRelays = await getRelaysFromNIP65()
      relays = fetchedRelays.length > 0 ? fetchedRelays : getDefaultRelays()
    } catch (err) {
      relayError = err instanceof Error ? err.message : String(err)
    } finally {
      relayLoading = false
    }
  }

  async function handleAddRelay() {
    if (!newRelayUrl.trim()) {
      relayError = 'Relay URL cannot be empty'
      return
    }

    if (!isValidRelayUrl(newRelayUrl)) {
      relayError = 'Invalid relay URL. Must be wss:// format'
      return
    }

    if (relays.some(r => r.url === newRelayUrl)) {
      relayError = 'This relay is already added'
      return
    }

    try {
      relayLoading = true
      relayError = null
      relaySuccess = null

      const updatedRelays = [...relays, { url: newRelayUrl, read: true, write: true }]
      await publishRelays(updatedRelays)

      relays = updatedRelays
      newRelayUrl = ''
      showRelayForm = false
      relaySuccess = 'Relay added successfully'
      setTimeout(() => (relaySuccess = null), 3000)
    } catch (err) {
      relayError = err instanceof Error ? err.message : String(err)
    } finally {
      relayLoading = false
    }
  }

  async function handleRemoveRelay(url: string) {
    try {
      relayLoading = true
      relayError = null
      relaySuccess = null

      const updatedRelays = relays.filter(r => r.url !== url)

      if (updatedRelays.length === 0) {
        relayError = 'Cannot remove all relays - you must keep at least one'
        return
      }

      await publishRelays(updatedRelays)

      relays = updatedRelays
      relaySuccess = 'Relay removed successfully'
      setTimeout(() => (relaySuccess = null), 3000)
    } catch (err) {
      relayError = err instanceof Error ? err.message : String(err)
    } finally {
      relayLoading = false
    }
  }

  async function handleToggleRelay(index: number, type: 'read' | 'write') {
    try {
      relayLoading = true
      relayError = null
      relaySuccess = null

      const relay = relays[index]
      const updated = { ...relay }

      if (type === 'read') {
        updated.read = !updated.read
      } else {
        updated.write = !updated.write
      }

      // Ensure at least one is enabled
      if (!updated.read && !updated.write) {
        relayError = 'Relay must have read or write enabled'
        return
      }

      const updatedRelays = [...relays]
      updatedRelays[index] = updated

      await publishRelays(updatedRelays)

      relays = updatedRelays
      relaySuccess = 'Relay updated successfully'
      setTimeout(() => (relaySuccess = null), 3000)
    } catch (err) {
      relayError = err instanceof Error ? err.message : String(err)
    } finally {
      relayLoading = false
    }
  }

  // Wallet state
  const nodes: MoneroNode[] = getAvailableNodes()
  let nodeBusy: string | null = null

  async function handleNodeChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement
    const nodeId = select.value
    nodeBusy = nodeId
    try {
      await setActiveNode(nodeId)
    } catch (err) {
      console.error('Failed to switch node:', err)
    } finally {
      nodeBusy = null
    }
  }

  // Lightning/NWC state
  let nwcUri = ''
  let nwcConnecting = false
  let nwcError: string | null = null
  let nwcSuccess: string | null = null
  let nwcBalance: number | null = null
  let nwcInfo: Record<string, any> | null = null
  let loadingNWCData = false
  let nwcDataLoaded = false

  async function handleConnectNWC() {
    if (!nwcUri.trim()) {
      nwcError = 'Please enter a valid NWC connection string'
      return
    }

    try {
      nwcConnecting = true
      nwcError = null
      nwcSuccess = null

      const success = setNWCFromURI(nwcUri)
      if (!success) {
        throw new Error('Invalid NWC connection string')
      }

      // Test connection by fetching wallet info
      await loadNWCData()

      nwcUri = ''
      nwcSuccess = 'Successfully connected to wallet!'
      setTimeout(() => (nwcSuccess = null), 3000)
    } catch (err) {
      nwcError = err instanceof Error ? err.message : 'Failed to connect wallet'
      disconnectNWC()
    } finally {
      nwcConnecting = false
    }
  }

  async function loadNWCData() {
    if (!$nwcConnected || loadingNWCData || nwcDataLoaded) return

    try {
      loadingNWCData = true
      nwcError = null

      const [balance, info] = await Promise.all([
        getNWCBalance().catch(() => null),
        getNWCInfo().catch(() => null),
      ])

      nwcBalance = balance
      nwcInfo = info
      nwcDataLoaded = true
    } catch (err) {
      console.error('Failed to load NWC data:', err)
    } finally {
      loadingNWCData = false
    }
  }

  function handleDisconnectNWC() {
    disconnectNWC()
    nwcBalance = null
    nwcInfo = null
    nwcDataLoaded = false
    nwcSuccess = 'Wallet disconnected'
    setTimeout(() => (nwcSuccess = null), 3000)
  }

  // Load NWC data once when tab is opened
  $: if (activeTab === 'lightning' && $nwcConnected && !nwcDataLoaded && !loadingNWCData) {
    void loadNWCData()
  }

  const settingsTabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'relays', label: 'Relays', icon: ServerIcon },
    { id: 'wallet', label: 'Wallet', icon: EmberIcon },
    { id: 'lightning', label: 'Lightning', icon: ZapIcon },
  ]
</script>

<div class="w-full pb-24 md:pb-0">
  <!-- Tabs header -->
  <div class="sticky top-0 z-20 border-b border-dark-border/60 bg-dark/80 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-dark/60">
    <div class="flex h-14 md:h-16 w-full items-center justify-between px-3 md:px-6 gap-2">
      <div class="flex flex-1 w-full items-center gap-3 overflow-x-auto">
        {#each settingsTabs as tab (tab.id)}
          {@const isActive = activeTab === tab.id}
          <button
            type="button"
            class={`flex flex-1 md:min-w-[120px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 md:px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
              isActive
                ? 'bg-primary text-dark shadow-md shadow-primary/20'
                : 'text-text-muted hover:text-text-soft hover:bg-dark/30'
            }`}
            on:click={() => activeTab = tab.id}
            aria-label={tab.label}
          >
            {#if tab.icon}
              <svelte:component this={tab.icon} size={16} />
            {/if}
            <span class="hidden md:inline">{tab.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Tab content -->
  <div class="flex-1 overflow-y-auto px-3 py-6 md:px-8 md:py-8">
    {#if !$currentUser}
      <div class="flex h-full items-center justify-center text-text-muted">
        <div class="space-y-2 text-center">
          <p class="text-lg font-semibold text-text-soft">Not logged in</p>
          <p class="text-sm">Connect your Nostr key to manage settings</p>
        </div>
      </div>
    {:else if activeTab === 'profile'}
      {@const metadata = $metadataCache.get($currentUser.pubkey)}
      {@const avatarUrl = getAvatarUrl(metadata)}
      {@const nip05 = getNip05Display(metadata?.nip05)}
      {@const profileName = metadata?.display_name || metadata?.name || $currentUser.name || 'Anonymous'}
      {@const handleLabel = nip05 || (metadata?.name ? `@${metadata.name}` : `${$currentUser.pubkey.slice(0, 12)}...`)}

      <div class="max-w-3xl mx-auto space-y-6">
        <section class="surface-card flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-4">
            <div class="h-16 w-16 overflow-hidden rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
              {#if avatarUrl}
                <img src={avatarUrl} alt={profileName} class="h-full w-full object-cover" />
              {:else}
                <div class="flex h-full w-full items-center justify-center">
                  {$currentUser.pubkey.slice(0, 2).toUpperCase()}
                </div>
              {/if}
            </div>
            <div>
              <h3 class="text-lg font-semibold text-text-soft">{profileName}</h3>
              <p class="text-sm text-text-muted">{handleLabel}</p>
            </div>
          </div>

          <button
            type="button"
            class={`rounded-full border px-5 py-2 text-sm font-medium transition-colors ${
              isEditingProfile
                ? 'border-primary/70 text-primary hover:bg-primary/10'
                : 'border-dark-border/70 text-text-soft hover:border-primary/60 hover:text-white'
            }`}
            on:click={isEditingProfile ? cancelProfileEdit : startProfileEdit}
            aria-pressed={isEditingProfile}
            disabled={profileSaving}
          >
            {isEditingProfile ? 'Close Editor' : 'Edit Profile'}
          </button>
        </section>

        <section class="surface-card p-6 space-y-6">
          <div class="space-y-1">
            <h4 class="text-sm font-semibold uppercase tracking-[0.3em] text-text-muted">Nostr Identity</h4>
            <p class="text-sm text-text-muted/80">Manage your NIP-01 metadata so every Nostr client shows the same profile.</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="text-xs uppercase tracking-[0.25em] text-text-muted">Public Key</label>
              <p class="mt-2 break-all text-sm text-text-soft/80 font-mono bg-dark/50 rounded-lg border border-dark-border/60 p-3">
                {$currentUser.pubkey}
              </p>
            </div>
            <div>
              <label class="text-xs uppercase tracking-[0.25em] text-text-muted">NIP-05 Verification</label>
              <p class="mt-2 text-sm text-text-soft/80 bg-dark/50 rounded-lg border border-dark-border/60 p-3">
                {nip05 || 'Not set'}
              </p>
            </div>
          </div>

          <div class="border-t border-dark-border/60 pt-6 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-base font-semibold text-text-soft">Profile Metadata</p>
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Writes kind 0 events to your relays</p>
              </div>
              {#if isEditingProfile}
                <span class="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                  Editing
                </span>
              {/if}
            </div>

            {#if profileError}
              <div class="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200" role="alert">
                {profileError}
              </div>
            {/if}

            {#if profileSuccess}
              <div class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200" role="status">
                {profileSuccess}
              </div>
            {/if}

            {#if isEditingProfile}
              <form class="space-y-5" on:submit|preventDefault={handleProfileSubmit}>
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-text-soft">Display Name</label>
                    <input
                      type="text"
                      maxlength="80"
                      autocomplete="name"
                      bind:value={profileDisplayNameInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="Jane Doe"
                      disabled={profileSaving}
                    />
                    <p class="mt-1 text-xs text-text-muted">Shown prominently across feeds.</p>
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-text-soft">Username (NIP-01 name)</label>
                    <input
                      type="text"
                      maxlength="64"
                      autocomplete="username"
                      bind:value={profileUsernameInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="janedoe"
                      disabled={profileSaving}
                    />
                    <p class="mt-1 text-xs text-text-muted">Lowercase handle stored in metadata.</p>
                  </div>
                </div>

                <div>
                  <label class="mb-1 block text-sm font-medium text-text-soft">Bio</label>
                  <textarea
                    rows="4"
                    maxlength="1024"
                    bind:value={profileAboutInput}
                    class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                    placeholder="Share what you do, what you care about, or how to reach you."
                    disabled={profileSaving}
                  />
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-text-soft">Website</label>
                    <input
                      type="url"
                      autocomplete="url"
                      bind:value={profileWebsiteInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="https://example.com"
                      disabled={profileSaving}
                    />
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-text-soft">NIP-05 Identifier</label>
                    <input
                      type="text"
                      bind:value={profileNip05Input}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="you@example.com"
                      disabled={profileSaving}
                    />
                    <p class="mt-1 text-xs text-text-muted">Requires DNS TXT record on your domain.</p>
                  </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-text-soft">Avatar URL</label>
                    <input
                      type="url"
                      bind:value={profileAvatarInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="https://cdn.example.com/avatar.png"
                      disabled={profileSaving}
                    />
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-text-soft">Banner URL</label>
                    <input
                      type="url"
                      bind:value={profileBannerInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="https://cdn.example.com/banner.jpg"
                      disabled={profileSaving}
                    />
                  </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-text-soft">Lightning Address (LUD-16)</label>
                    <input
                      type="text"
                      bind:value={profileLud16Input}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="name@wallet.com"
                      disabled={profileSaving}
                    />
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-text-soft">LNURL (LUD-06)</label>
                    <input
                      type="text"
                      bind:value={profileLud06Input}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="lnurl1..."
                      disabled={profileSaving}
                    />
                  </div>
                  <div class="md:col-span-2">
                    <label class="mb-1 block text-sm font-medium text-text-soft">Ember Monero Address</label>
                    <input
                      type="text"
                      inputmode="text"
                      spellcheck="false"
                      bind:value={profileMoneroAddressInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70 font-mono"
                      placeholder="8B... full integrated or subaddress"
                      disabled={profileSaving}
                    />
                    <p class="mt-1 text-xs text-text-muted">Published at metadata key <code>monero_address</code> for Embers.</p>
                  </div>
                </div>

                <div class="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    class="rounded-full border border-dark-border/70 px-5 py-2 text-sm font-medium text-text-soft transition-colors hover:border-primary/60 hover:text-white disabled:opacity-50"
                    on:click={cancelProfileEdit}
                    disabled={profileSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    class="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-dark transition-colors hover:bg-primary/90 disabled:opacity-60"
                    disabled={profileSaving}
                  >
                    {profileSaving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            {:else}
              <dl class="grid gap-4 md:grid-cols-2">
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Display Name</dt>
                  <dd class="mt-2 text-sm text-text-soft">{metadata?.display_name || metadata?.name || 'Not set'}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Username (name)</dt>
                  <dd class="mt-2 text-sm text-text-soft">{metadata?.name || 'Not set'}</dd>
                </div>
                <div class="md:col-span-2">
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Bio</dt>
                  <dd class="mt-2 whitespace-pre-line rounded-lg border border-dark-border/60 bg-dark/40 p-3 text-sm text-text-soft/90">
                    {metadata?.about || 'Not set'}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Website</dt>
                  <dd class="mt-2 text-sm">
                    {#if metadata?.website}
                      <a
                        href={metadata.website}
                        target="_blank"
                        rel="noreferrer"
                        class="text-primary hover:underline break-all"
                      >
                        {metadata.website}
                      </a>
                    {:else}
                      <span class="text-text-muted">Not set</span>
                    {/if}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Avatar URL</dt>
                  <dd class="mt-2 break-all text-sm text-text-soft/90">{metadata?.picture || 'Not set'}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Banner URL</dt>
                  <dd class="mt-2 break-all text-sm text-text-soft/90">{metadata?.banner || 'Not set'}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">LUD-16</dt>
                  <dd class="mt-2 text-sm text-text-soft/90">{metadata?.lud16 || 'Not set'}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">LUD-06</dt>
                  <dd class="mt-2 break-all text-sm text-text-soft/90">{metadata?.lud06 || 'Not set'}</dd>
                </div>
                <div class="md:col-span-2">
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Monero Address</dt>
                  <dd class="mt-2 break-all text-sm font-mono text-text-soft/90">{metadata?.monero_address || 'Not set'}</dd>
                </div>
              </dl>
            {/if}
          </div>
        </section>
      </div>

    {:else if activeTab === 'relays'}
      <div class="max-w-3xl mx-auto space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-lg font-semibold text-text-soft">Nostr Relays</h4>
            <p class="text-sm text-text-muted mt-1">Manage your relay connections</p>
          </div>
          <button
            type="button"
            on:click={() => (showRelayForm = !showRelayForm)}
            class="rounded-full border border-dark-border/70 px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:border-primary/60 hover:text-white"
            disabled={relayLoading}
          >
            {showRelayForm ? 'Cancel' : 'Add Relay'}
          </button>
        </div>

        {#if showRelayForm}
          <div class="surface-card space-y-3 p-4">
            <input
              type="text"
              placeholder="wss://relay.example.com"
              bind:value={newRelayUrl}
              class="w-full rounded-lg border border-dark-border bg-dark/50 px-3 py-2 text-sm text-text-soft placeholder-text-muted/50 outline-none focus:border-primary/60"
              disabled={relayLoading}
            />
            <button
              type="button"
              on:click={handleAddRelay}
              disabled={relayLoading || !newRelayUrl.trim()}
              class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-dark transition-colors disabled:opacity-50 hover:bg-primary/90"
            >
              {relayLoading ? 'Adding...' : 'Add Relay'}
            </button>
          </div>
        {/if}

        {#if relayError}
          <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {relayError}
          </div>
        {/if}

        {#if relaySuccess}
          <div class="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">
            {relaySuccess}
          </div>
        {/if}

        {#if relayLoading}
          <div class="flex items-center justify-center py-4">
            <p class="text-sm text-text-muted">Loading...</p>
          </div>
        {:else if relays.length === 0}
          <div class="rounded-lg border border-dark-border/60 bg-dark/50 p-4 text-center text-sm text-text-muted">
            No relays configured. Add one to get started.
          </div>
        {:else}
          <div class="space-y-2">
            {#each relays as relay, index (relay.url)}
              <div class="surface-card flex items-center justify-between gap-4 p-4">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-text-soft">{relay.url}</p>
                  <div class="mt-2 flex gap-4">
                    <label class="flex items-center gap-2 text-xs text-text-muted">
                      <input
                        type="checkbox"
                        checked={relay.read}
                        on:change={() => handleToggleRelay(index, 'read')}
                        disabled={relayLoading || (!relay.read && !relay.write)}
                        class="rounded accent-primary"
                      />
                      <span>Read</span>
                    </label>
                    <label class="flex items-center gap-2 text-xs text-text-muted">
                      <input
                        type="checkbox"
                        checked={relay.write}
                        on:change={() => handleToggleRelay(index, 'write')}
                        disabled={relayLoading || (!relay.read && !relay.write)}
                        class="rounded accent-primary"
                      />
                      <span>Write</span>
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  on:click={() => handleRemoveRelay(relay.url)}
                  disabled={relayLoading || relays.length === 1}
                  class="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                  title="Remove relay"
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    {:else if activeTab === 'wallet'}
      <div class="max-w-3xl mx-auto space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-lg font-semibold text-text-soft">Monero Wallet</h4>
            <p class="text-sm text-text-muted mt-1">
              {$walletState.hasWallet ? ($walletState.isReady ? 'Wallet ready' : 'Setting up wallet...') : 'No wallet configured'}
            </p>
          </div>
          <button
            class="rounded-full border border-dark-border/70 px-5 py-2 text-sm font-medium text-text-soft transition-colors hover:border-primary/60 hover:text-white"
            on:click={() => showWallet.set(true)}
          >
            {$walletState.hasWallet ? 'Open Wallet' : 'Set Up Wallet'}
          </button>
        </div>

        <div class="surface-card space-y-6 p-6">
          <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Balance</p>
              <p class="mt-2 text-3xl font-bold text-primary">
                {$walletState.balance.toFixed(6)} XMR
              </p>
              <p class="text-sm text-text-muted">Unlocked: {$walletState.unlockedBalance.toFixed(6)} XMR</p>
            </div>
          </div>

          {#if $walletState.address}
            <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
              <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Address</p>
              <p class="mt-2 break-all text-sm text-text-soft/80 font-mono">
                {$walletState.address}
              </p>
            </div>
          {/if}

          <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-text-soft">Share Ember address</p>
                <p class="text-xs text-text-muted">
                  Publish your Monero wallet address so others can send Embers directly.
                </p>
              </div>
              <label class="flex items-center gap-2 text-sm font-semibold text-text-soft">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-primary"
                  checked={shareAddress}
                  on:change={handleShareToggle}
                />
                <span>{shareAddress ? 'On' : 'Off'}</span>
              </label>
            </div>
          </div>

          {#if $walletState.hasWallet}
            <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
              <label class="block">
                <p class="text-sm font-semibold text-text-soft mb-2">Monero Node</p>
                <select
                  class="w-full rounded-lg border border-dark-border bg-dark/50 px-3 py-2 text-sm text-text-soft outline-none focus:border-primary/60"
                  value={$walletState.selectedNode ?? nodes[0]?.id}
                  on:change={handleNodeChange}
                  disabled={nodeBusy !== null}
                >
                  {#each nodes as node (node.id)}
                    <option value={node.id}>
                      {node.label} - {node.uri}
                    </option>
                  {/each}
                </select>
                {#if nodeBusy}
                  <p class="mt-2 text-xs text-text-muted">Switching nodes...</p>
                {/if}
              </label>
            </div>
          {/if}
        </div>
      </div>

    {:else if activeTab === 'lightning'}
      <div class="max-w-3xl mx-auto space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-lg font-semibold text-text-soft">Lightning Network</h4>
            <p class="text-sm text-text-muted mt-1">
              {$nwcConnected ? 'Wallet connected' : 'Connect a Lightning wallet to send zaps'}
            </p>
          </div>
        </div>

        {#if !$nwcConnected}
          <div class="surface-card space-y-4 p-6">
            <div>
              <h5 class="text-base font-semibold text-text-soft mb-2">Connect Wallet</h5>
              <p class="text-sm text-text-muted mb-4">
                Use Nostr Wallet Connect (NWC) to connect your Lightning wallet. Get a connection string from wallets like Alby, Mutiny, or Cashu.
              </p>
            </div>

            <div class="space-y-3">
              <div>
                <label for="nwc-uri" class="block text-sm font-medium text-text-soft mb-2">
                  NWC Connection String
                </label>
                <input
                  id="nwc-uri"
                  type="password"
                  placeholder="nostr+walletconnect://..."
                  bind:value={nwcUri}
                  class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft placeholder-text-muted/50 outline-none focus:border-primary/60"
                  disabled={nwcConnecting}
                />
                <p class="mt-2 text-xs text-text-muted">
                  Paste your nostr+walletconnect:// connection string here
                </p>
              </div>

              <button
                type="button"
                on:click={handleConnectNWC}
                disabled={nwcConnecting || !nwcUri.trim()}
                class="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-dark shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
              >
                {nwcConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>

            {#if nwcError}
              <div class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                {nwcError}
              </div>
            {/if}

            {#if nwcSuccess}
              <div class="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200">
                {nwcSuccess}
              </div>
            {/if}
          </div>

          <div class="surface-card p-6">
            <h5 class="text-base font-semibold text-text-soft mb-3">How to get NWC</h5>
            <ul class="space-y-2 text-sm text-text-muted">
              <li class="flex gap-2">
                <span class="text-primary">•</span>
                <span><strong class="text-text-soft">Alby:</strong> Go to alby.com, create wallet, find NWC in settings</span>
              </li>
              <li class="flex gap-2">
                <span class="text-primary">•</span>
                <span><strong class="text-text-soft">Mutiny:</strong> Open mutiny.plus, go to Settings → Nostr Wallet Connect</span>
              </li>
              <li class="flex gap-2">
                <span class="text-primary">•</span>
                <span><strong class="text-text-soft">Cashu:</strong> Use a Cashu wallet that supports NWC</span>
              </li>
            </ul>
          </div>

        {:else}
          <div class="surface-card space-y-6 p-6">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h5 class="text-base font-semibold text-text-soft">Wallet Connected</h5>
                <p class="text-sm text-text-muted mt-1 break-all font-mono text-xs">
                  {$nwcConnection?.walletPubkey.slice(0, 16)}...
                </p>
              </div>
              <button
                type="button"
                on:click={handleDisconnectNWC}
                class="shrink-0 rounded-full border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10"
              >
                Disconnect
              </button>
            </div>

            {#if loadingNWCData}
              <div class="flex items-center justify-center py-4">
                <p class="text-sm text-text-muted">Loading wallet info...</p>
              </div>
            {:else}
              {#if nwcBalance !== null}
                <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
                  <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Balance</p>
                  <p class="mt-2 text-3xl font-bold text-primary">
                    {nwcBalance.toLocaleString()} sats
                  </p>
                </div>
              {/if}

              {#if nwcInfo}
                <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
                  <p class="text-xs uppercase tracking-[0.3em] text-text-muted mb-3">Wallet Info</p>
                  <div class="space-y-2 text-sm">
                    {#each Object.entries(nwcInfo) as [key, value]}
                      <div class="flex flex-col gap-1">
                        <span class="text-text-muted">{key}:</span>
                        <span class="text-text-soft font-mono text-xs break-all">{String(value)}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}

            <div class="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p class="text-sm text-text-soft">
                ⚡ You can now send zaps by clicking the zap button on any post!
              </p>
            </div>

            {#if nwcSuccess}
              <div class="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200">
                {nwcSuccess}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
