# Parte 9: Frontend (parcial) — Relatório de Revisão

## Escopo

- `app/app.vue` — Root layout (apenas `<NuxtPage />`)
- `app/pages/auth/` — 5 páginas: `login.vue`, `register.vue`, `forget-password.vue`, `reset-password.vue`, `verify-email.vue`
- **Ausentes**: pages para orders, restaurant (cashier/kitchen/tables), print, companies, settings, dashboard
- **Ausentes**: `components/`, `composables/`, `stores/`, `layouts/`, `assets/`, `i18n/`

---

## Veredito

| Critério             | Status      | Justificativa                                                                                                                                                                                                                                                                                      |
| -------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend Status**  | **PARCIAL** | Apenas 5 páginas de auth (login, register, forget-password, reset-password, verify-email). **NÃO EXISTE** páginas para: orders (20+ endpoints), restaurant (8+ endpoints), print (3 endpoints), companies (5 endpoints), dashboard, settings. Zero components, composables, stores, layouts, i18n. |
| **R1 — Bugs/Falhas** | ⚠️          | Error handling genérico (`e instanceof Error ? e.message : '...'`) — não parseia JSON `{error, message}` do contrato; não trata 401/403/429 especificamente; CSRF token não incluído nas requests (middleware espera `x-csrf-token` header); `rememberMe` checkbox mas não persistido localmente   |
| **R2 — Segurança**   | ⚠️          | Password inputs usam `autocomplete="new-password"` (bom); `autocomplete="email"` (bom); **MAS** CSRF token não enviado → proteção ineficaz; error messages mostram raw message (pode vazar detalhes se backend mudar)                                                                              |

---

## Achados

### P09-A01 — CSRF token não incluído nas requests (proteção ineficaz)

- **Tipo**: Segurança / Bug
- **Severidade**: **Alta**
- **Confiança**: Alta
- **Arquivo**: `app/pages/auth/*.vue` (todas), `server/middleware/02-csrf-validate.ts:14`
- **Evidência**: Middleware `02-csrf-validate` exige header `x-csrf-token` em POST/PUT/DELETE não-exempt. Páginas auth fazem `$fetch('/api/auth/login', { method: 'POST', body: ... })` **sem header CSRF**. Rotas auth estão em `csrfExemptPaths` (linha 64-72 `csrf.ts`) — login, register, forget-password, verify-email, reset-password, send-verification-email **são exempt**. **Porém**: após login, páginas protegidas (orders, restaurant, print) **não são exempt** e falharão sem CSRF token.
- **Impacto**:
  1. Auth pages funcionam (exempt) mas páginas pós-login falharão 403 `csrf_invalid`
  2. Frontend não tem lógica para obter cookie `merp-csrf_token` e enviar header `x-csrf-token`
- **Correção**:
  1. Criar composable `useApiFetch` que lê cookie `merp-csrf_token` (split `.` pega token) e adiciona header `x-csrf-token`
  2. Ou usar `$fetch` global wrapper em `app/plugins/api.ts`
  3. Middleware `01-csrf-token` já seta cookie — frontend só precisa ler e enviar

### P09-A02 — Error handling genérico não parseia contrato `{error, message}`

- **Tipo**: Bug (UX/DX)
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `app/pages/auth/login.vue:22`, `register.vue:24`, `forget-password.vue:17`, `reset-password.vue:30`, `verify-email.vue:16`
- **Evidência**: Todos fazem `const message = e instanceof Error ? e.message : 'Erro...'`. Backend retorna `JSON.stringify({ error: '...', message: '...' })` no `message` do Error. Frontend mostra message raw (ex.: `{"error":"invalid_credentials","message":"Invalid email or password"}`) ao invés de `message` field.
- **Impacto**: UX ruim — user vê JSON cru. Não distingue error codes (401 vs 403 vs 429) para UX específica (ex.: "email não verificado" → link para reenviar).
- **Correção**:
  ```ts
  catch (e: unknown) {
    let msg = 'Erro inesperado'
    if (e && typeof e === 'object' && 'data' in e) {
      const data = e.data as { error?: string; message?: string }
      msg = data.message || msg
      // switch (data.error) { case 'email_not_verified': ... }
    } else if (e instanceof Error) {
      msg = e.message
    }
    error.value = msg
  }
  ```

### P09-A03 — `reset-password.vue` valida client-side mas backend também valida (duplicação OK)

- **Tipo**: Bug (consistência)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `app/pages/auth/reset-password.vue:14-21`, `server/api/auth/reset-password.post.ts:18-27`
- **Evidência**: Frontend valida `password === confirmPassword` e `length >= 8`. Backend `validateResetPasswordInput` + `isWeakPassword` + `checkPasswordBreach` + `MAX_PASSWORD_LENGTH`. Duplicação OK (defesa em profundidade) mas frontend não usa `isWeakPassword` / HIBP.
- **Impacto**: User pode submeter senha fraca/breach → backend rejeita → error message genérico.
- **Correção**: Opcional — mover validações para shared composable ou aceitar duplicação.

### P09-A04 — `consentTermsVersion` hardcoded `'v1'` no register

- **Tipo**: Bug (data integrity)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `app/pages/auth/register.vue:4`
- **Evidência**: `const consentTermsVersion = ref('v1')` — hardcoded. Backend exige `consentTermsVersion` (validateRegisterInput). Se termos mudarem para `v2`, frontend não atualiza automaticamente.
- **Impacto**: Usuário concorda com versão errada. LGPD: consentimento deve ser versão específica.
- **Correção**: Buscar versão atual via endpoint público (ex.: `GET /api/terms/current`) ou configurar via env/build.

### P09-A05 — Nenhuma página protegida por auth guard (route middleware)

- **Tipo**: Segurança / Funcionalidade ausente
- **Severidade**: Média
- **Confiança**: Alta
- **Arquivo**: `app/` (sem `middleware/` pasta)
- **Evidência**: Nuxt 4 suporta route middleware (`definePageMeta`, `middleware/auth.global.ts`). Não existe. Páginas auth acessíveis sem sessão (OK), mas páginas futuras (orders, restaurant) não terão guard.
- **Impacto**: User não-autenticado acessa `/orders` → 401 API mas página carrega → UX quebrada.
- **Correção**: Criar `app/middleware/auth.global.ts`:
  ```ts
  export default defineNuxtRouteMiddleware(async (to) => {
    if (to.path.startsWith('/auth')) return
    const { data } = await useFetch('/api/auth/me')
    if (!data.value) return navigateTo('/auth/login')
  })
  ```

### P09-A06 — Ausência total de: components, composables, stores, layouts, i18n

- **Tipo**: Funcionalidade ausente (esperado para fase atual)
- **Severidade**: — (informativo)
- **Confiança**: Alta
- **Evidência**:
  - `app/components/` — não existe
  - `app/composables/` — não existe (precisa: `useApiFetch`, `useAuth`, `useCompany`, `useToast`)
  - `app/stores/` — não existe (precisa: Pinia stores para auth, company, ui)
  - `app/layouts/` — não existe (precisa: `default.vue` com header/sidebar, `auth.vue` sem layout)
  - `app/assets/` — não existe (CSS global, fonts)
  - `i18n` — não configurado (pt-BR apenas por enquanto)
- **Nota**: Esperado — spec Phase 4 (Core Order) em andamento, frontend vem depois.

### P09-A07 — Login page: `rememberMe` não persistido localmente (UX)

- **Tipo**: Bug (UX)
- **Severidade**: Baixa
- **Confiança**: Alta
- **Arquivo**: `app/pages/auth/login.vue:4,70-75`
- **Evidência**: `rememberMe` ref mas não lido de `localStorage` no mount. Se user marca, recarrega página → checkbox desmarcado.
- **Correção**: `onMounted(() => { rememberMe.value = localStorage.getItem('rememberMe') === 'true' })` + `watch(rememberMe, v => localStorage.setItem('rememberMe', v))`.

### P09-A08 — Tailwind CSS classes inline (sem design system / component library)

- **Tipo**: Tech debt / DX
- **Severidade**: Baixa
- **Confiança**: Alta
- **Evidência**: Todas páginas usam classes Tailwind inline (`max-w-md w-full space-y-8`, `bg-indigo-600 hover:bg-indigo-700`, etc.). Sem componentes reutilizáveis (`<Input />`, `<Button />`, `<Card />`, `<FormField />`).
- **Impacto**: Duplicação de código, inconsistência visual, manutenção difícil.
- **Correção**: Criar `app/components/ui/` com componentes base (Input, Button, Card, Label, Alert) ou adotar library (`@nuxt/ui`, `shadcn-vue`, `PrimeVue`).

---

## Pontos Fortes

- **Pages bem estruturadas**: `<script setup lang="ts">`, `ref`, `computed`, `onMounted` corretos
- **Loading states**: `loading` ref + disabled button + spinner SVG
- **Error display**: `error` ref + `role="alert"` para acessibilidade
- **Navigation**: `NuxtLink` para rotas internas, `navigateTo` programático
- **Autocomplete attrs**: `email`, `current-password`, `new-password` corretos
- **Accessibility**: `sr-only` labels, `role="alert"`, focus rings
- **Success states**: `success` ref + checkmark SVG + mensagem amigável

---

## Sinais para Roadmap

- **P0 (bloqueador)**: CSRF token handling (`useApiFetch` composable) — **sem isso, páginas pós-login falham 403**
- **P0 (bloqueador)**: Auth route middleware (`auth.global.ts`) — protege rotas privadas
- **P1**: Error handling padronizado (parse `{error, message}`, switch por error code)
- **P1**: Design system / component library (`app/components/ui/`)
- **P1**: Pinia stores (auth, company, ui) + composables (`useAuth`, `useCompany`, `useApiFetch`)
- **P1**: Layouts (`default.vue` com sidebar/header, `auth.vue` limpo)
- **P2**: i18n (pt-BR → futuro multi-lang)
- **P2**: Testes E2E (Playwright/Cypress) para fluxos auth

---

## Não Verificado / Dúvidas

- `app/app.vue` apenas `<NuxtPage />` — sem layout global, sem providers
- `nuxt.config.ts` não tem `modules: ['@nuxt/ui']` ou similar
- `package.json` não tem `@pinia/nuxt`, `@vueuse/nuxt`, `@nuxtjs/i18n`
- Build/deploy frontend não testado (precisa `CORS_ORIGIN` no build)
