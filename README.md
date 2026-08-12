# Music Marketplace Agent Tool Server

Hosted, read-only tools for searching the Discogs database, retrieving exact releases and masters,
identifying ambiguous pressings, comparing releases, and—only when explicitly enabled—reading
officially supported marketplace data.

Discogs database metadata and marketplace data are distinct. Marketplace results are live asking
price or listing observations, not historical sales data or valuations.

## Tool surface

- Search artists, masters, releases, and labels.
- Retrieve artists, labels, masters, releases, and versions of a master.
- Identify releases from barcode or catalogue-number-plus-label evidence.
- Compare two to five explicit release IDs.
- Retrieve marketplace statistics or a known listing ID when its feature gate is enabled.

There are no collection mutations, orders, listing creation, seller operations, marketplace search,
scraping, image handling, or valuation claims.

## Architecture and transports

`src/tools/definitions.ts` is the single Zod-backed registry. The same definitions generate runtime
validation, `/tools`, HTTP tool endpoints, OpenAPI, stdio MCP, and Streamable HTTP MCP.

```text
HTTP / OpenAPI / MCP -> ToolRegistry -> Services -> MusicMarketplaceProvider -> Discogs
```

## Local use

Node.js 22 is required. Create a Discogs personal access token and use a descriptive User-Agent with
an application identity and contact:

```bash
npm ci
cp .env.example .env
# Set DISCOGS_TOKEN and DISCOGS_USER_AGENT in .env
npm run dev
```

Caller-facing authentication remains separate from the Discogs credential. Production requires
`AUTH_MODE=api-key`, strong `API_KEYS`, a non-development Discogs token, and the official API base
URL. Build stdio MCP with `npm run build && npm run mcp:stdio`.

## Data policy

Every normalized result includes its source URL, retrieval time, and Discogs attribution. The server
does not return, proxy, transform, or cache images. Cache TTLs default to zero pending written
approval. Marketplace tools default off pending approval for hosted redistribution.

The required user-visible notice is:

> This application uses Discogs' API but is not affiliated with, sponsored or endorsed by Discogs.

Before public or commercial operation, confirm with Discogs:

- hosted multi-tenant and commercial use;
- redistribution through HTTP and MCP;
- database and marketplace cache retention;
- required attribution placement;
- marketplace listing relay and derived comparisons;
- any future image use.

Review the current [Discogs API documentation](https://www.discogs.com/developers) and
[API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use)
before deployment. The implementation does not itself grant permission.

## Rate limits and reliability

The adapter sends token authentication and the configured User-Agent, tracks Discogs rate-limit
headers, limits its own outbound request budget, coalesces identical requests, retries only
idempotent transient failures, honors numeric `Retry-After`, and applies timeouts. Identification
caps candidate detail retrieval at ten releases. A single production replica is recommended until a
distributed outbound quota is added.

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run openapi:emit
npm run metadata:validate
docker build -t agent-tool-server-music-marketplace .
az bicep build --file infra/main.bicep
az bicep lint --file infra/main.bicep
```

## License

MIT
