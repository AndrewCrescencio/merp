Aplique a migration no banco de dados:

```bash
npx drizzle-kit migrate
```

Verifique se as funções e políticas foram criadas:

```bash
docker compose exec -T postgres psql -U merp -d merp -c "\df get_tenant_id"
docker compose exec -T postgres psql -U merp -d merp -c "\dp company"
docker compose exec -T postgres psql -U merp -d merp -c "\dp company_member"
```
