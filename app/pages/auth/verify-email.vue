<script setup lang="ts">
const route = useRoute()
const loading = ref(true)
const error = ref('')
const success = ref(false)

async function verify() {
  loading.value = true
  try {
    await $fetch('/api/auth/verify-email', {
      method: 'GET',
      query: { token: route.query.token },
    })
    success.value = true
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Link inválido ou expirado'
    error.value = message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (route.query.token) {
    verify()
  } else {
    loading.value = false
    error.value = 'Token não fornecido'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="max-w-md w-full space-y-8 text-center">
      <div v-if="loading" class="flex flex-col items-center">
        <svg class="animate-spin h-10 w-10 text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p class="mt-4 text-gray-600">Verificando...</p>
      </div>

      <div v-else-if="success">
        <svg
          class="mx-auto h-12 w-12 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
        <h3 class="mt-4 text-lg font-medium text-gray-900">Email verificado!</h3>
        <p class="mt-2 text-sm text-gray-600">Sua conta foi confirmada com sucesso.</p>
        <NuxtLink
          to="/auth/login"
          class="mt-6 inline-block font-medium text-indigo-600 hover:text-indigo-500"
        >
          Entrar
        </NuxtLink>
      </div>

      <div v-else>
        <svg
          class="mx-auto h-12 w-12 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
        <h3 class="mt-4 text-lg font-medium text-gray-900">Erro na verificação</h3>
        <p class="mt-2 text-sm text-gray-600">{{ error }}</p>
        <NuxtLink
          to="/auth/login"
          class="mt-6 inline-block font-medium text-indigo-600 hover:text-indigo-500"
        >
          Voltar ao login
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
