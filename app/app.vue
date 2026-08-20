<script setup lang="ts">
import { onMounted } from 'vue'

// AUD: o token de reset chega no fragmento de hash (#/reset-password?token=...)
// — nunca em query (logs de servidor/proxies). A página de reset lê o token
// aqui no mount e o remove do address bar para não ficar exposto na história.
onMounted(() => {
  if (window.location.hash.includes('token=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtWelcome />
  </div>
</template>
