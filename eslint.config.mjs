import withNuxt from './.nuxt/eslint.config.mjs'
import prettier from 'eslint-config-prettier'

export default withNuxt(
  { name: 'merp/prettier', ...prettier },
  {
    name: 'merp/ignores',
    ignores: ['.nuxt/', '.output/'],
  },
  {
    name: 'merp/no-owner-db-in-production',
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['#shared/utils/db', 'server/utils/db'],
              importNames: ['createOwnerDbForSetupOnly'],
              message:
                'createOwnerDbForSetupOnly is FORBIDDEN in production code and test assertions. Use `db` (app role) for all queries. Only allowed in test setup/fixtures (beforeAll, beforeEach, test-setup.ts).',
            },
            // Feature boundary: auth/identity must not import auth/company, auth/invite
            {
              group: ['server/utils/auth/company/**', 'server/utils/auth/invite/**'],
              message:
                'Feature boundary violation: identity feature must not import company or invite features. Use shared/ or cross-feature service.',
            },
            // Feature boundary: auth/company must not import auth/identity, auth/invite
            {
              group: ['server/utils/auth/identity/**', 'server/utils/auth/invite/**'],
              message:
                'Feature boundary violation: company feature must not import identity or invite features. Use shared/ or cross-feature service.',
            },
            // Feature boundary: auth/invite must not import auth/identity, auth/company
            {
              group: ['server/utils/auth/identity/**', 'server/utils/auth/company/**'],
              message:
                'Feature boundary violation: invite feature must not import identity or company features. Use shared/ or cross-feature service.',
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
