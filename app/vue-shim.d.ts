// O tsc não sabe importar .vue (só o vue-tsc do `nuxt typecheck` valida o SFC
// a sério); sem este shim o app/app.spec.ts não passa no `tsc -b`.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
