<script lang="ts">
  import { onMount } from 'svelte'
  import { isAuthenticated, currentUser } from '$stores/auth'
  import { isInitialized, initError } from '$stores/app'
  import { initDB } from '$lib/db'
  import { initNDK } from '$lib/ndk'
  import { restoreSession } from '$lib/auth'

  import { feedSource } from '$stores/feedSource'
  import { feedError, feedLoading, following, circles } from '$stores/feed'
  import {
    stopAllSubscriptions,
    clearFeed,
    subscribeToGlobalFeed,
    subscribeToFollowingFeed,
    subscribeToCirclesFeed,
    subscribeToLongReadsFeed,
    subscribeToLongReadsFollowingFeed,
    subscribeToLongReadsCirclesFeed,
    loadUserInteractions,
  } from '$lib/feed-ndk'
  import { startNotificationListener, stopNotificationListener } from '$lib/notifications'
  import { hydrateWalletStateLazy as hydrateWalletState, initWalletLifecycleLazy as initWalletLifecycle } from '$lib/wallet/lazy'
  import {
    hydrateInteractionsFromCache,
    startInteractionPersistence,
    stopInteractionPersistence,
  } from '$lib/interaction-cache'

  // force reactivity for feedSource
  $: $feedSource

  import Layout from './components/Layout.svelte'
  import Login from './components/pages/Login.svelte'
  import PinPrompt from './components/PinPrompt.svelte'

  onMount(async () => {
    try {
      await initDB()
      await initNDK()
      await restoreSession()
      await hydrateWalletState()
      initWalletLifecycle()

      // default feed: global on startup
      await subscribeToGlobalFeed()

      isInitialized.set(true)
    } catch (err) {
      logger.error('App initialization error:', err)
      initError.set(String(err))
      isInitialized.set(true)
    }
  })

  onMount(() => {
    startInteractionPersistence()
    return () => {
      stopInteractionPersistence()
    }
  })

  // Track last feed source to avoid duplicate subscriptions
  let lastFeedSource: string | null = null
  let interactionsLoadedFor: string | null = null
  let interactionCacheHydratedFor: string | null = null
  let lastAuthKey: string | null = null

  // switching tabs changes subscription here
  // Following AI_Guidelines: Be explicit about reactive dependencies
  $: if ($isInitialized) {
    const targetFeed = $feedSource
    const authed = $isAuthenticated
    const pubkey = $currentUser?.pubkey ?? null
    const authKey = authed ? pubkey ?? 'auth' : 'guest'
    if (targetFeed === lastFeedSource && authKey === lastAuthKey) {
      // No relevant change
    } else {
      lastFeedSource = targetFeed
      lastAuthKey = authKey

    ;(async () => {
      // Stop all subscriptions and clear feed
      stopAllSubscriptions()
      clearFeed()

      // Give subscriptions time to actually stop before starting new ones
      await new Promise(resolve => setTimeout(resolve, 100))

      if (targetFeed === 'global') {
        await subscribeToGlobalFeed()
        return
      }

      if (!authed || !pubkey) {
        feedError.set('Log in to view this feed')
        feedLoading.set(false)
        return
      }

      // Clear stale login warnings once authenticated
      feedError.set(null)

      if (targetFeed === 'following') {
        await subscribeToFollowingFeed()
        return
      }

      if (targetFeed === 'circles') {
        await subscribeToCirclesFeed()
        return
      }

      if (targetFeed === 'long-reads') {
        await subscribeToLongReadsFeed()
        return
      }

      if (targetFeed === 'long-reads-following') {
        await subscribeToLongReadsFollowingFeed()
        return
      }

      if (targetFeed === 'long-reads-circles') {
        await subscribeToLongReadsCirclesFeed()
        return
      }
    })().catch(err => {
      logger.error('Subscription error:', err)
      feedError.set(String(err))
      feedLoading.set(false)
    })
    }
  }

  // Filtering is now handled automatically by the derived feedEvents store in feed.ts
  // Following AI_Guidelines: Logic lives in stores, reactivity is automatic

  // manage notifications and cleanup on logout
  $: if ($isAuthenticated && $currentUser?.pubkey) {
    if (interactionCacheHydratedFor !== $currentUser.pubkey) {
      hydrateInteractionsFromCache($currentUser.pubkey)
      interactionCacheHydratedFor = $currentUser.pubkey
    }
    startNotificationListener($currentUser.pubkey)
  } else {
    stopNotificationListener()
    stopAllSubscriptions()
    clearFeed()
    following.set(new Set())
    circles.set(new Set())
    interactionCacheHydratedFor = null
  }

  // Load historical interactions (likes, reposts, zaps) once per session per user
  $: if ($isInitialized && $isAuthenticated && $currentUser?.pubkey) {
    if (interactionsLoadedFor !== $currentUser.pubkey) {
      interactionsLoadedFor = $currentUser.pubkey
      loadUserInteractions().catch(err => {
        logger.error('Failed to load user interactions:', err)
      })
    }
  } else {
    interactionsLoadedFor = null
  }
</script>

{#if $isInitialized}
  {#if $initError}
    <div class="bg-red-600/10 border border-red-500/40 text-red-300 text-sm px-4 py-3 text-center">
      Initialization issue: {$initError}
    </div>
  {/if}
  {#if $isAuthenticated}
    <Layout />
  {:else}
    <Login />
  {/if}
{:else}
  <div class="flex items-center justify-center h-screen w-screen bg-bg-primary">
    <div class="text-center text-white">
      <div class="animate-spin mb-4 inline-block">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 3488 3488" style="display: block;">
          <path fill="#F79B5E" d="M793.688 172.637C890.011 161.88 897.316 256.465 902.51 324.37C907.38 388.038 909.488 460.5 943.399 515.783C964.411 550.039 996.142 585.006 1036.78 594.985L1039.65 594.224C1061.09 588.686 1098.05 565.852 1119.19 554.533C1139.26 543.784 1154.71 535.953 1175.74 526.2C1309.3 465.128 1452.55 428.031 1598.96 416.605C1897.38 394.099 2134.65 445.159 2390.93 585.161C2403.08 589.501 2414.96 592.682 2427.5 588.49C2598.72 529.253 2505.54 334.623 2582.63 214.419C2649.86 109.596 2776.15 226.199 2826.34 286.744C2961.61 450.233 3018.93 701.556 2886.71 884.315C2865.55 913.561 2836.57 948.311 2817.99 976.94L2816.88 978.685C2825.7 995.49 2842.73 1020.27 2853.13 1038.46C2883.68 1091.09 2910.97 1145.55 2934.85 1201.52C2978.36 1305.37 3012.6 1426.11 3040.23 1535.65C3054.09 1590.59 3062.37 1653.83 3070.5 1710.09C3090.1 1850.02 3103.09 1990.79 3109.44 2131.94C3123.81 2440.18 3133.42 2777.96 2891.28 3009.18C2821.61 3070.57 2756.43 3104.76 2664.4 3123.99C2512.37 3155.76 2344.63 3109.12 2216.85 3023.2C2134.26 3082.19 2021.14 3131.61 1922.57 3157.59C1757.76 3201.03 1576.15 3177.77 1419.44 3114.23C1366.38 3092.71 1312.38 3059.13 1263.23 3030.36C1067.55 3136.66 827.432 3183.29 630.709 3049.35C415.025 2902.49 362.35 2617.24 356.104 2374.16C352.631 2238.96 361.277 2102.41 372.625 1967.67C378.488 1898.05 384.069 1827.38 392.504 1758C408.982 1612.75 439.979 1469.52 485.032 1330.46C512.008 1249.16 548.086 1172.42 587.147 1096.31C592.53 1085.82 654.712 975.983 654.736 974.544C654.853 967.302 644.19 957.371 639.524 952.441C615.069 926.609 594.84 897.495 576.129 867.256C547.178 820.469 523.894 767.096 514.843 712.645C492.284 576.923 531.819 430.292 611.67 319.193C650.619 265.002 725.397 183.908 793.688 172.637Z"/>
          <path fill="#E17331" d="M1697.16 975.033C1806.01 972.807 1897.9 996.671 1991.49 1052.29C2004.31 1059.91 2017.61 1067.81 2029.45 1076.9C2036.62 1082.41 2042.48 1089.48 2050.48 1093.81C2085.3 1112.69 2132.37 1171.81 2155.86 1204.41C2160.86 1211.36 2164.63 1218.99 2169.45 1226.03C2176.62 1236.51 2185.08 1246.18 2191.21 1257.33C2203.61 1279.89 2214.75 1304.98 2224.51 1328.78C2227.63 1336.38 2228.62 1353.33 2233.26 1359.06C2234.57 1360.67 2236.58 1361.57 2238.24 1362.82C2247.02 1413.83 2259.2 1458.01 2257.97 1510.26C2259.08 1521.34 2257.71 1531.09 2256.97 1541.85C2254.21 1581.94 2250.39 1620.87 2241.07 1660.16C2237.12 1676.84 2228.81 1691.87 2222.36 1707.89C2216.28 1723.02 2210.92 1739 2204.1 1753.81C2173.02 1809.25 2123.65 1864.45 2080.21 1910.44C2074.71 1916.27 2017.25 1956.71 2009.62 1961.43C1940.92 2003.98 1861.53 2029.32 1781.45 2038.27C1760.35 2040.63 1733.63 2038.07 1712.28 2038.32C1670.15 2038.82 1644.05 2037.13 1603.34 2027.94C1596.62 2027.68 1583.87 2023.54 1576.94 2021.67C1520.37 2006.87 1466.93 1981.99 1419.19 1948.22C1331.96 1885.9 1265.04 1799.25 1226.78 1699.11C1213.86 1665.96 1203.41 1634.86 1200.1 1599.09C1198.27 1579.34 1193.92 1560.8 1193.05 1540.67C1187.96 1417.33 1224.23 1295.82 1296.09 1195.45C1327.35 1152.33 1369.04 1109.43 1412.18 1077.95C1415.6 1075.45 1425.28 1067.74 1428.67 1067.19C1428.49 1070.58 1427.47 1073.61 1426.44 1076.83L1428.27 1078.07C1446.71 1056.62 1497.15 1040.48 1511.54 1026.98L1510.93 1026.07C1496.91 1035.41 1475.86 1040.24 1461.54 1051.09C1454.32 1056.56 1438.64 1069.03 1430.05 1068.46L1429.98 1065.75C1435.77 1063.15 1446.07 1055.1 1452.71 1051.21C1468.99 1041.65 1512.82 1016.91 1529.03 1013.24C1524.17 1022.98 1524.83 1013.1 1520.93 1022.14C1525.93 1024.65 1533.59 1020.48 1536.71 1016.56L1535.64 1016.03L1539.93 1016.85C1534.6 1015.69 1536.6 1016.61 1532.32 1012.79L1532.74 1010.75C1539.41 1007.56 1548.37 1007.83 1556.05 1007.37C1561.93 1003.03 1569.22 998.917 1575.57 995.11L1575.75 998.553L1577.08 999.226C1580.93 994.471 1603.35 989.524 1607.93 992.342L1606.29 995.247L1613.82 995.73C1613.42 994.067 1613.02 992.404 1612.62 990.741C1617.1 990.716 1622.22 991.063 1626.09 989C1649.69 976.412 1667.41 982.986 1697.16 975.033Z"/>
          <path fill="#FEFEFD" d="M1705.71 987.255C1994.26 975.846 2237.28 1200.82 2248.13 1489.39C2258.98 1777.97 2033.54 2020.56 1744.94 2030.85C1457.14 2041.11 1215.36 1816.42 1204.54 1528.63C1193.72 1240.84 1417.94 998.632 1705.71 987.255Z"/>
          <path fill="#374956" d="M1949.57 1597.48C1945.11 1610.16 1938.01 1625.25 1931.05 1636.96C1865.22 1747.81 1717.92 1785.25 1606.58 1721.37C1546.11 1685.56 1511.27 1636.59 1493.59 1569.6C1461.68 1448.7 1541.49 1316.92 1662.41 1287.41C1747.94 1266.54 1847.06 1294.24 1905.1 1361.83C1922.88 1382.54 1945.03 1413.92 1951.58 1441.01C1967.84 1479.31 1967.49 1559.39 1949.57 1597.48Z"/>
          <path fill="#242C34" d="M1949.57 1597.48C1945.11 1610.16 1938.01 1625.25 1931.05 1636.96C1865.22 1747.81 1717.92 1785.25 1606.58 1721.37C1546.11 1685.56 1511.27 1636.59 1493.59 1569.6C1461.68 1448.7 1541.49 1316.92 1662.41 1287.41C1747.94 1266.54 1847.06 1294.24 1905.1 1361.83C1922.88 1382.54 1945.03 1413.92 1951.58 1441.01L1949.04 1440.91C1942.46 1428.31 1937.18 1415.33 1930.4 1402.63C1925.57 1411.99 1937.98 1418.32 1937.69 1426.6L1936.57 1424.56C1915.64 1386.83 1887.18 1352.59 1851.61 1328.18C1841.52 1321.26 1801.83 1307.19 1790.25 1303.2C1710.44 1275.7 1616.61 1297.13 1559.96 1360.46C1554.48 1366.58 1537.16 1391.88 1531.8 1391.77C1540.81 1364.64 1599 1319.83 1624.48 1306.63C1626.99 1305.35 1629.59 1304.24 1632.24 1303.29L1633.08 1302.13C1621.76 1301.17 1582.56 1329.91 1572.98 1338.15C1477.24 1420.54 1463.27 1563.69 1543.16 1661.87C1546.88 1666.44 1555.68 1674.98 1560.48 1677.94L1559.82 1676.51C1619.91 1725.97 1667.33 1752.08 1748.41 1744.98C1806.9 1739.85 1822.3 1724.07 1867.8 1693.3C1912.92 1662.78 1913.46 1633.58 1945.15 1601.6L1946.72 1594.02C1949.2 1596.06 1948.31 1594.87 1949.57 1597.48Z"/>
        </svg>
      </div>
      <p>Initializing Monstr...</p>
    </div>
  </div>
{/if}

<PinPrompt />

<style global>
  :global(body) {
    margin: 0;
    padding: 0;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
</style>

