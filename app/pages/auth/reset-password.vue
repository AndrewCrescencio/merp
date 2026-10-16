<script setup lang="ts">
const route = useRoute()
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref(false)
const loading = ref(false)
const tokenValid = ref(true)

const token = computed(() => route.query.token as string)

async function submit() {
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = 'Senhas não conferem'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Senha deve ter pelo menos 8 caracteres'
    return
  }
  loading.value = true
  try {
    await $fetch('/api/auth/password/reset', {
      method: 'POST',
      body: { token: token.value, newPassword: password.value },
    })
    success.value = true
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Link inválido ou expirado'
    error.value = message
    tokenValid.value = false
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!token.value) {
    tokenValid.value = false
    error.value = 'Token não fornecido'
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="max-w-md w-full space-y-8">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">Redefinir senha</h2>
      </div>

      <div v-if="success" class="text-center">
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
        <h3 class="mt-4 text-lg font-medium text-gray-900">Senha alterada!</h3>
        <p class="mt-2 text-sm text-gray-600">Sua senha foi atualizada com sucesso.</p>
        <NuxtLink
          to="/auth/login"
          class="mt-6 inline-block font-medium text-indigo-600 hover:text-indigo-500"
        >
          Entrar
        </NuxtLink>
      </div>

      <form v-else class="mt-8 space-y-6" @submit.prevent="submit">
        <div v-if="!tokenValid" class="text-red-600 text-sm text-center" role="alert">
          Link inválido ou expirado.
          <NuxtLink to="/auth/forget-password" class="underline">Solicite um novo</NuxtLink>.
        </div>

        <p v-if="error && tokenValid" class="text-red-600 text-sm text-center" role="alert">
          {{ error }}
        </p>

        <div v-if="tokenValid" class="space-y-4">
          <div>
            <label for="password" class="sr-only">Nova senha</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Nova senha (mín. 8 caracteres)"
              class="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            />
          </div>

          <div>
            <label for="confirmPassword" class="sr-only">Confirmar senha</label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Confirmar nova senha"
              class="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            />
          </div>
        </div>

        <div v-if="tokenValid">
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
              Redefinindo...
            </span>
            <span v-else>Redefinir senha</span>
          </button>
        </div>
      </form>

      <p class="text-center text-sm text-gray-600">
        <NuxtLink to="/auth/login" class="font-medium text-indigo-600 hover:text-indigo-500">
          Voltar ao login
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
