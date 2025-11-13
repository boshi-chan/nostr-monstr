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
  <line x1="18" y1="6" x2="6" y2="18" />
  <line x1="6" y1="6" x2="18" y2="18" />
</svg>
