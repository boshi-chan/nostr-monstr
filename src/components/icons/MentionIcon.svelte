<script lang="ts">
  export let size: number = 24
  export let color: string = 'currentColor'
  export let strokeWidth: number = 2
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  xmlns="http://www.w3.org/2000/svg"
>
  <circle cx="12" cy="11" r="4" />
  <path d="M16 7v5a2 2 0 0 0 4 0V12a8 8 0 1 0-3.17 6.31" />
</svg>
