<script lang="ts">
  import { onMount } from 'svelte'
  import {
    notifications,
    unreadCount,
    markAllAsRead,
    markAsRead,
    removeNotification,
  } from '$stores/notifications'
  import { openPostById } from '$stores/router'
  import type { Notification } from '$stores/notifications'
  import LikeIcon from '../icons/LikeIcon.svelte'
  import CommentIcon from '../icons/CommentIcon.svelte'
  import RepostIcon from '../icons/RepostIcon.svelte'
  import ZapIcon from '../icons/ZapIcon.svelte'
  import MentionIcon from '../icons/MentionIcon.svelte'

  type IconComponent = typeof LikeIcon

  interface NotificationVisual {
    icon: IconComponent
    accent: string
    background: string
    label: string
  }

  const notificationVisuals: Record<Notification['type'], NotificationVisual> = {
    like: {
      icon: LikeIcon,
      accent: 'text-rose-400',
      background: 'bg-rose-500/10',
      label: 'liked your post',
    },
    reply: {
      icon: CommentIcon,
      accent: 'text-orange-400',
      background: 'bg-orange-500/10',
      label: 'replied to you',
    },
    quote: {
      icon: CommentIcon,
      accent: 'text-orange-400',
      background: 'bg-orange-500/10',
      label: 'quoted your post',
    },
    'thread-reply': {
      icon: CommentIcon,
      accent: 'text-orange-400',
      background: 'bg-orange-500/10',
      label: "replied in a thread you're in",
    },
    repost: {
      icon: RepostIcon,
      accent: 'text-emerald-400',
      background: 'bg-emerald-500/10',
      label: 'reposted you',
    },
    zap: {
      icon: ZapIcon,
      accent: 'text-yellow-400',
      background: 'bg-yellow-500/10',
      label: 'zapped your post',
    },
    mention: {
      icon: MentionIcon,
      accent: 'text-sky-400',
      background: 'bg-sky-500/10',
      label: 'mentioned you',
    },
  }

  onMount(() => {
    markAllAsRead()
  })

  let orderedNotifications: Notification[] = []
  $: orderedNotifications = [...$notifications].sort((a, b) => b.createdAt - a.createdAt)

  function handleNotificationClick(notification: Notification) {
    markAsRead(notification.id)
    if (notification.eventId) {
      // Use the current active route as the origin tab
      openPostById(notification.eventId, 'notifications')
    }
  }

  function handleDismiss(notificationId: string, event: Event) {
    event.stopPropagation()
    removeNotification(notificationId)
  }

  function formatTimestamp(seconds: number): string {
    const diffMs = Date.now() - seconds * 1000
    const diffSec = Math.round(diffMs / 1000)
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

    if (diffSec < 60) return rtf.format(-diffSec, 'second')

    const diffMin = Math.round(diffSec / 60)
    if (diffMin < 60) return rtf.format(-diffMin, 'minute')

    const diffHour = Math.round(diffMin / 60)
    if (diffHour < 24) return rtf.format(-diffHour, 'hour')

    const diffDay = Math.round(diffHour / 24)
    if (diffDay < 30) return rtf.format(-diffDay, 'day')

    const diffMonth = Math.round(diffDay / 30)
    if (diffMonth < 12) return rtf.format(-diffMonth, 'month')

    const diffYear = Math.round(diffMonth / 12)
    return rtf.format(-diffYear, 'year')
  }
</script>

<section class="mx-auto flex h-full max-w-3xl flex-col px-4 pb-24 pt-6 md:px-8 md:pt-10">
  <header class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-text-soft">Notifications</h1>
      <p class="text-sm text-text-muted">{$unreadCount} unread</p>
    </div>
    {#if orderedNotifications.length > 0}
      <button
        type="button"
        class="rounded-lg border border-dark-border px-3 py-1 text-sm text-text-muted transition-colors hover:border-primary/60 hover:text-text-soft"
        on:click={markAllAsRead}
      >
        Mark all read
      </button>
    {/if}
  </header>

  <div class="flex-1">
    {#if orderedNotifications.length === 0}
      <div class="flex h-full items-center justify-center text-text-muted">
        <p>No notifications yet.</p>
      </div>
    {:else}
      <div class="flex flex-col divide-y divide-dark-border rounded-2xl border border-dark-border/60 bg-dark/60">
        {#each orderedNotifications as notification (notification.id)}
          {@const config = notificationVisuals[notification.type]}
          <div
            class="relative cursor-pointer px-5 py-4 transition-colors hover:bg-dark-lighter/40"
            role="button"
            tabindex="0"
            on:click={() => handleNotificationClick(notification)}
            on:keydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleNotificationClick(notification)
              }
            }}
          >
            <div class="flex items-start gap-3">
              {#if notification.fromAvatar}
                <img
                  src={notification.fromAvatar}
                  alt={notification.fromName}
                  class="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                />
              {:else}
                <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-dark-border text-sm text-text-muted">
                  {notification.fromName?.charAt(0) || '?'}
                </div>
              {/if}

              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-center gap-3 text-sm">
                  <span class={`flex h-7 w-7 items-center justify-center rounded-full ${config.background} ${config.accent}`}>
                    <svelte:component this={config.icon} size={16} color="currentColor" strokeWidth={1.75} />
                  </span>
                  <span class="font-semibold text-text-soft truncate">{notification.fromName ?? 'User'}</span>
                  <span class="text-text-muted">{config.label}</span>
                  {#if notification.type === 'zap' && notification.amount}
                    <span class={`${config.accent} font-semibold`}>{notification.amount} sats</span>
                  {/if}
                </div>

                {#if notification.eventContent}
                  <p class="mt-1 text-sm text-text-muted line-clamp-2">
                    {notification.eventContent}
                  </p>
                {/if}

                <p class="mt-2 text-xs text-text-muted/70">
                  {formatTimestamp(notification.createdAt)}
                </p>
              </div>

              <button
                type="button"
                on:click={(event) => handleDismiss(notification.id, event)}
                class="text-text-muted hover:text-red-400 transition-colors flex-shrink-0"
                title="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  :global(.line-clamp-2) {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-clamp: 2;
  }
</style>
