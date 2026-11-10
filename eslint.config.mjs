import withNuxt from './.nuxt/eslint.config.mjs'
import prettier from 'eslint-config-prettier'

export default withNuxt(
  { name: 'merp/prettier', ...prettier },
  {
    name: 'merp/ignores',
    ignores: ['.nuxt/', '.output/'],
  },
  {
    // createOwnerDbForSetupOnly vive em tests/support/owner-db.ts e só pode ser
    // importado de dentro de tests/ e scripts/ — nunca de código de produção
    // nem de outros testes.
    name: 'merp/no-owner-db-outside-tests',
    files: ['**/*.{ts,mjs}'],
    ignores: ['tests/**', 'scripts/**', '**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['tests/support/owner-db', '**/tests/support/owner-db'],
              importNames: ['createOwnerDbForSetupOnly'],
              message:
                'createOwnerDbForSetupOnly é FORA DE ESCOPO fora de tests/ e scripts/. Use `db` (role merp_app). Apenas test-setup/fixtures usam o owner DB.',
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
