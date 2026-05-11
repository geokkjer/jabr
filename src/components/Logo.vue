<script setup lang="ts">
interface Props {
  size?: number
}

withDefaults(defineProps<Props>(), {
  size: 48,
})

defineOptions({
  name: 'JabrLogo',
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Book Cover -->
    <rect x="6" y="4" width="20" height="24" rx="2" fill="#2b2118" />
    <!-- Pages (side) -->
    <rect x="24" y="5" width="2" height="22" fill="#fdfbf7" opacity="0.8" />
    <!-- Bookmark -->
    <path d="M18 4v10l-3-2-3 2V4h6z" fill="#d98324" />
    <!-- Spine detail -->
    <path d="M9 8h2M9 12h2M9 16h2" stroke="#fdfbf7" stroke-width="1" stroke-linecap="round" opacity="0.3" />
  </svg>
</template>
