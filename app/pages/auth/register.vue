<script setup lang="ts">
import type { AcquisitionChannel } from '~~/shared/contracts/acquisition'

const productInsightsEnabled = useRuntimeConfig().public.productInsightsEnabled === true
const acquisitionChannel = ref<AcquisitionChannel | ''>('')
const acquisitionOptions: Record<AcquisitionChannel, string> = {
  search: 'Busca na internet',
  social: 'Redes sociais',
  referral: 'Indicação',
  advertising: 'Anúncio',
  event: 'Evento',
  other: 'Outro canal',
}
const email = ref('')
const password = ref('')
const name = ref('')
const consentTermsVersion = ref('v1')
const auth = useAuthFetch()
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.register(
      email.value.trim(),
      password.value,
      name.value.trim(),
      consentTermsVersion.value.trim(),
      productInsightsEnabled ? acquisitionChannel.value || undefined : undefined,
    )
    await navigateTo('/auth/login')
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao registrar'
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
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">Criar conta</h2>
      </div>
      <form class="mt-8 space-y-6" @submit.prevent="submit">
        <p v-if="error" class="text-red-600 text-sm text-center" role="alert">
          {{ error }}
        </p>

        <div class="space-y-4">
          <div>
            <label for="name" class="sr-only">Nome</label>
            <input
              id="name"
              v-model="name"
              type="text"
              required
              autocomplete="name"
              placeholder="Nome completo"
              class="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            />
          </div>

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

          <div>
            <label for="password" class="sr-only">Senha</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Senha (mín. 8 caracteres)"
              class="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            />
          </div>

          <div>
            <label for="consent" class="sr-only">Versão dos termos</label>
            <input
              id="consent"
              v-model="consentTermsVersion"
              type="text"
              required
              placeholder="Versão termos (ex: v1)"
              class="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
            />
          </div>
        </div>

        <div v-if="productInsightsEnabled">
          <label for="acquisition-channel" class="block text-sm font-medium text-gray-900">
            Como você conheceu o MERP? (opcional)
          </label>
          <select
            id="acquisition-channel"
            v-model="acquisitionChannel"
            aria-describedby="acquisition-channel-help"
            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Prefiro não responder</option>
            <option v-for="(label, channel) in acquisitionOptions" :key="channel" :value="channel">
              {{ label }}
            </option>
          </select>
          <p id="acquisition-channel-help" class="mt-1 text-sm text-gray-600">
            Sua resposta entra apenas na contagem por canal, sem associação à sua conta.
          </p>
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
              Criando conta...
            </span>
            <span v-else>Registrar</span>
          </button>
        </div>
      </form>

      <p class="text-center text-sm text-gray-600">
        Já tem conta?
        <NuxtLink to="/auth/login" class="font-medium text-indigo-600 hover:text-indigo-500">
          Entrar
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
