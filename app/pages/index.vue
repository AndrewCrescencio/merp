<script setup lang="ts">
const auth = useAuthFetch()

const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  await auth.logout()
  await navigateTo('/auth/login', { replace: true })
}
</script>

<template>
  <main class="min-h-screen bg-gray-50 px-6 py-12">
    <div class="mx-auto max-w-3xl rounded-lg bg-white p-8 shadow-sm">
      <div class="flex items-start justify-between gap-6">
        <div>
          <p class="text-sm font-medium text-indigo-600">Application starter</p>
          <h1 class="mt-2 text-3xl font-semibold text-gray-900">Sua aplicação começa aqui</h1>
          <p class="mt-3 text-gray-600">
            A autenticação e a fundação multi-tenant estão prontas. Adicione a primeira feature de
            domínio neste espaço.
          </p>
        </div>
        <button
          type="button"
          class="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          :disabled="signingOut"
          @click="signOut"
        >
          Sair
        </button>
      </div>

      <div class="mt-8 grid gap-4 sm:grid-cols-3">
        <div class="rounded-md border border-gray-200 p-4">
          <h2 class="font-medium text-gray-900">Auth</h2>
          <p class="mt-1 text-sm text-gray-500">Sessões e recuperação de senha</p>
        </div>
        <div class="rounded-md border border-gray-200 p-4">
          <h2 class="font-medium text-gray-900">Tenants</h2>
          <p class="mt-1 text-sm text-gray-500">Empresas, membros e convites</p>
        </div>
        <div class="rounded-md border border-gray-200 p-4">
          <h2 class="font-medium text-gray-900">RLS</h2>
          <p class="mt-1 text-sm text-gray-500">Isolamento garantido no banco</p>
        </div>
      </div>
    </div>
  </main>
</template>
