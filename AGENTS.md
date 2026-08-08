<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan at specs/001-auth-context/plan.md

<!-- SPECKIT END -->

## Available MCPs

This project has the following MCP servers configured. You MUST use them
whenever a question or task matches their domain — prefer MCP tool calls
over guessing or making up documentation URLs.

### Nuxt MCP

Use when the user asks about Nuxt components, composables, configuration,
deployment, migration, modules, or any Nuxt-specific topic.

Tools:

- `list_documentation_pages` / `get_documentation_page` — official docs
- `list_modules` / `get_module` — module discovery and details
- `list_blog_posts` / `get_blog_post` — Nuxt announcements and guides
- `list_deploy_providers` / `get_deploy_provider` — deployment instructions
- `get_getting_started_guide` — setup overview for a given version
- `get_changelog` — latest releases and changes

### Better Auth MCP

Use when the user asks about authentication setup, session management,
providers (email, OAuth, passkeys), plugins (2FA, admin, organization),
or any Better Auth-specific topic.

Tools:

- `search_docs` — find relevant documentation pages by query
- `get_doc` — retrieve full page content by path

## Test Co-location Rule

Tests MUST be co-located beside the code they validate.
Naming: unit tests → `.spec.ts`, integration tests (real DB) → `.test.ts`.

- `server/api/auth/register.post.ts` → `server/api/auth/register.post.spec.ts`
- `server/utils/auth/identity/repository.ts` → `server/utils/auth/identity/repository.test.ts`
- NEVER place tests under `/specs/` — `/specs` is documentation-only.

## Commit Convention for AI-Generated Changes

All commits produced by AI agents MUST include the model and agent name in the
commit body. This ensures traceability of AI-assisted contributions.

Format:

```
<semantic type>(<scope>): <short description>

Model: <model-name>
Agent: <agent-name / tool>
```

Example:

```
test(auth): rename unit test files from .test.ts to .spec.ts

Model: deepseek-v4-flash-free
Agent: opencode
```
