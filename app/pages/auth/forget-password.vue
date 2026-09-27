<script setup lang="ts">
const email = ref('')
const error = ref('')
const success = ref(false)
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/forget-password', {
      method: 'POST',
      body: { email: email.value.trim() },
    })
    success.value = true
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao enviar email'
    error.value = message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="max-w-md w-full space-y-8">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">Recuperar senha</h2>
      </div>
      <form v-if="!success" class="mt-8 space-y-6" @submit.prevent="submit">
        <p v-if="error" class="text-red-600 text-sm text-center" role="alert">
          {{ error }}
        </p>

        <div class="space-y-4">
          <div>
            <label for="email" class="sr-only">Email</label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="Email"
              class="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            :disabled="loading"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="loading" class="flex items-center">
              <svg
                class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
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
              Enviando...
            </span>
            <span v-else>Enviar link de recuperação</span>
          </button>
        </div>
      </form>

      <div v-else class="text-center">
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
        <h3 class="mt-4 text-lg font-medium text-gray-900">Email enviado</h3>
        <p class="mt-2 text-sm text-gray-600">
          Se o email existir, você receberá um link para redefinir a senha.
        </p>
        <NuxtLink
          to="/auth/login"
          class="mt-6 inline-block font-medium text-indigo-600 hover:text-indigo-500"
        >
          Voltar ao login
        </NuxtLink>
      </div>

      <p class="text-center text-sm text-gray-600">
        <NuxtLink to="/auth/login" class="font-medium text-indigo-600 hover:text-indigo-500">
          Voltar ao login
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
