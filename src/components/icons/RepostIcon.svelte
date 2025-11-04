<script lang="ts">
  export let size: number = 24
  export let color: string = 'currentColor'
  export let strokeWidth: number = 2
</script>

<svg
  {color}
  fill="none"
  height={size}
  stroke={color}
  stroke-linecap="round"
  stroke-linejoin="round"
  stroke-width={strokeWidth}
  viewBox="0 0 24 24"
  width={size}
  xmlns="http://www.w3.org/2000/svg"
>
  <polyline points="17 2 21 6 17 10" />
  <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
  <polyline points="7 22 3 18 7 14" />
  <path d="M21 13v1a4 4 0 0 1-4 4H3" />
</svg>
