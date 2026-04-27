# hallux

**Your AI is writing code your AI can't review.**

Hallux is an AI-aware GitHub PR reviewer that specifically catches failure modes in AI-generated code: hallucinated imports, phantom tests, and fabricated method calls.

Generic PR reviewers (CodeRabbit, Greptile, Cursor BugBot) treat AI-generated PRs the same as human-written ones. The failure modes are different. Hallux is purpose-built for the patterns that slip through.

## v0.1 Rule Packs

| Rule Pack | What it catches | Severity |
|---|---|---|
| `hallucinated-imports` | Imports of packages/exports that don't exist on npm/PyPI | critical |
| `phantom-tests` | Tests with zero assertions, mock-only tests, smoke tests with no return value checks | high |
| `fabricated-methods` | Method calls on types that don't have those methods | critical |

## Monorepo Layout

```
hallux/
├── apps/
│   ├── web/          # Next.js 15 landing page + benchmark scoreboard
│   └── action/       # GitHub Action entry point
├── packages/
│   ├── engine/       # Agent loop, tool definitions, aggregator
│   ├── rule-packs/   # The three v0.1 rule packs
│   ├── eval/         # Eval harness with fixture PRs
│   └── shared/       # Shared TypeScript types
├── .github/workflows/
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Dev Setup

**Prerequisites:** Node 20+, pnpm 9+

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start the landing page
pnpm dev --filter=web

# Run the eval harness
pnpm --filter=@hallux/eval run eval
```

## Using the Action

Add to `.github/workflows/hallux.yml`:

```yaml
name: Hallux PR Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  hallux:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: hallux/hallux@v0.1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          enabled-rule-packs: hallucinated-imports,phantom-tests,fabricated-methods
          min-severity: medium
```

## Action Outputs

| Output | Description |
|---|---|
| `findings_count` | Total number of findings |
| `severity_max` | Highest severity finding (`critical`, `high`, `medium`, `low`, `none`) |

## Running Locally with `act`

```bash
# Install act: https://github.com/nektos/act
brew install act

# Run against a PR event
act pull_request \
  --secret ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --eventpath .github/test-event.json
```

## Architecture

Hallux uses a custom agent loop built directly on the Anthropic SDK — no LangChain, no LlamaIndex.

For each enabled rule pack, an agent is spawned with:
- A scoped system prompt describing what to look for
- Access to a curated set of tools (read_file, search_code, check_registry, parse_ast)
- A maximum of 10 tool calls before forced conclusion
- A zod-validated `report_findings` tool for structured output

An aggregator then deduplicates findings by file+line+rulePack, ranks by severity, and produces PR review markdown.

## Models

- `claude-sonnet-4-6` — agents and aggregator
- `claude-haiku-4-5-20251001` — cheap context building (future use)

## License

MIT
