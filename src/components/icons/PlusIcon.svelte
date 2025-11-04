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
  <line x1="12" y1="5" x2="12" y2="19" />
  <line x1="5" y1="12" x2="19" y2="12" />
</svg>
