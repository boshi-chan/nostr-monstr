<script lang="ts">
  export let size: number = 24
  export let strokeWidth: number = 2
  export let color: string = 'currentColor'
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <!-- Video camera icon with "LIVE" indicator -->
  <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
  <polygon points="12 7 2 12 12 17 12 7" />
  <circle cx="19" cy="7" r="2" fill={color} opacity="0.8" />
</svg>
