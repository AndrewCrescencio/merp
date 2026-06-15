<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan at specs/001-auth-context/plan.md
<!-- SPECKIT END -->

## Nuxt Documentation

You have access to the Nuxt MCP server which provides documentation tools and prompts.

## Test Co-location Rule

Tests MUST be co-located beside the code they validate.
- `server/api/auth/register.post.ts` → `server/api/auth/register.post.test.ts`
- `server/utils/auth/repository.ts` → `server/utils/auth/repository.test.ts`
- NEVER place tests under `/specs/` — `/specs` is documentation-only.

## Nuxt Documentation

When the user asks anything related to Nuxt (components, composables, configuration, deployment, migration, etc.), you MUST use the Nuxt MCP server before answering:
- Use the `find_documentation_for_topic` prompt to find the best documentation pages for the topic
- Use `list_documentation_pages` to browse available docs
- Use `get_documentation_page` to retrieve specific page content
