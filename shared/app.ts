/**
 * Identidade da aplicação "merp" — única fonte de verdade para os valores que
 * aparecem em cookies, headers e mensagens da aplicação.
 *
 * Para derivar este starter noutro produto, mude aqui e leia a seção
 * "Renomeando o projeto" do README. Pacote, roles e nomes de banco de dados
 * NÃO entram nesta lista: estão fixos em migrations, docker-compose, CI e
 * testes.
 */
export const APP_NAME = 'merp'

// Prefixo dos cookies da aplicação (better-auth `cookiePrefix` e o cookie CSRF).
export const COOKIE_PREFIX = 'merp'

export const SESSION_COOKIE_NAME = `${COOKIE_PREFIX}-session_token` // merp-session_token
export const CSRF_COOKIE_NAME = `${COOKIE_PREFIX}-csrf_token` // merp-csrf_token
