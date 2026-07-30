Execute todos os testes para verificar se as alterações estão funcionando:

```bash
# Testes unitários completos
npx vitest run server/

# Ou, para testes específicos:
npx vitest run server/utils/auth/tenant-context.spec.ts
npx vitest run server/utils/auth/repository.test.ts
npx vitest run server/api/auth/

# Para ver em watch mode durante desenvolvimento:
npx vitest
```

Se tudo passar, o RLS está implementado corretamente.
