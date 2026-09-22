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
          ],
        },
      ],
    },
  },
)
