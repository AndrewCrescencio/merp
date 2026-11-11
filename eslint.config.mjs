import withNuxt from './.nuxt/eslint.config.mjs'
import prettier from 'eslint-config-prettier'

export default withNuxt(
  { name: 'merp/prettier', ...prettier },
  {
    name: 'merp/ignores',
    ignores: ['.nuxt/', '.output/'],
  },
  {
    // Bloqueia importar o módulo tests/support/owner-db (createOwnerDbForSetupOnly,
    // import * como namespace ou qualquer especificador) de qualquer ficheiro
    // FORA de tests/ e scripts/. O owner DB bypassa RLS — só testes de setup/fixtures
    // e scripts o usam; handlers, middlewares e asserções usam `db` (role merp_app).
    //
    // files: .ts/.mjs apenas. .vue não entra: um <script> de componente Nuxt não
    // importa um helper de BD Node (daria erro no build/typecheck) e não é vetor
    // real do owner-db — decisão: não incluir .vue.
    //
    // ignores: só tests/** e scripts/** (antes também ignorava **/*.spec.ts e
    // **/*.test.ts, o que furava a regra para testes fora de tests/, ex.:
    // server/utils/foo.spec.ts).
    name: 'merp/no-owner-db-outside-tests',
    files: ['**/*.{ts,mjs}'],
    ignores: ['tests/**', 'scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Sem importNames: bloqueia o módulo inteiro, então named import,
              // import * as od e qualquer outro especificador são barrados.
              // group com globs cobre caminhos relativos (../../tests/support/owner-db)
              // e aliases (~~/tests/support/owner-db, @/tests/support/owner-db).
              group: ['tests/support/owner-db', '**/tests/support/owner-db'],
              message:
                'Importar owner-db fora de tests/ e scripts/ é proibido. Use `db` (role merp_app).',
            },
          ],
        },
      ],
    },
  },
  {
    // Fronteira: auth/identity não importa auth/company nem auth/invite.
    name: 'merp/boundary-identity',
    files: ['server/utils/auth/identity/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/company/**', '**/invite/**'],
              message:
                'Feature boundary violation: auth/identity não deve importar auth/company nem auth/invite. Use shared/ ou um serviço trans-feature.',
            },
          ],
        },
      ],
    },
  },
  {
    // Fronteira: auth/company não importa auth/identity nem auth/invite.
    name: 'merp/boundary-company',
    files: ['server/utils/auth/company/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/identity/**', '**/invite/**'],
              message:
                'Feature boundary violation: auth/company não deve importar auth/identity nem auth/invite. Use shared/ ou um serviço trans-feature.',
            },
          ],
        },
      ],
    },
  },
  {
    // Fronteira: auth/invite não importa auth/identity nem auth/company.
    name: 'merp/boundary-invite',
    files: ['server/utils/auth/invite/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/identity/**', '**/company/**'],
              message:
                'Feature boundary violation: auth/invite não deve importar auth/identity nem auth/company. Use shared/ ou um serviço trans-feature.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'merp/test-files',
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
