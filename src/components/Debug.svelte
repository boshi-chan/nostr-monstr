<script lang="ts">
  import { activeTab } from '$stores/nav'
</script>

<div class="p-4 text-white">
  <h1 class="text-2xl font-bold mb-4">🔥 Monstr Debug</h1>
  
  <div class="space-y-2">
    <p>✅ App is rendering</p>
    <p>✅ Stores are working</p>
    <p>Current tab: <strong>{$activeTab}</strong></p>
    <p class="text-sm text-gray-400">If you see this, the app is working!</p>
  </div>
  
  <div class="mt-4 p-3 bg-dark-light rounded">
    <p class="text-sm">Try clicking the buttons below:</p>
    <div class="flex gap-2 mt-2">
      <button 
        class="px-3 py-1 bg-primary text-dark rounded hover:bg-secondary transition-colors"
        on:click={() => activeTab.set('home')}
      >
        Home
      </button>
      <button 
        class="px-3 py-1 bg-primary text-dark rounded hover:bg-secondary transition-colors"
        on:click={() => activeTab.set('messages')}
      >
        Messages
      </button>
      <button 
        class="px-3 py-1 bg-primary text-dark rounded hover:bg-secondary transition-colors"
        on:click={() => activeTab.set('profile')}
      >
        Profile
      </button>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background-color: #242C34;
  }
</style>
