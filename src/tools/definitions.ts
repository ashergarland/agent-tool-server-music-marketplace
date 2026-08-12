import { z } from 'zod';
import type { Services } from '../services/index.js';

export interface ToolInvocationContext {
  readonly requestId: string;
  readonly principal: string;
}

export type ToolKind = 'read' | 'write';

export interface ToolDefinition<
  InputSchema extends z.ZodType = z.ZodType,
  OutputSchema extends z.ZodType = z.ZodType,
> {
  readonly name: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly kind: ToolKind;
  readonly inputSchema: InputSchema;
  readonly outputSchema: OutputSchema;
  readonly handler: (
    input: z.output<InputSchema>,
    services: Services,
    context: ToolInvocationContext,
  ) => Promise<z.output<OutputSchema>>;
}

export const defineTool = <InputSchema extends z.ZodType, OutputSchema extends z.ZodType>(
  definition: ToolDefinition<InputSchema, OutputSchema>,
): ToolDefinition<InputSchema, OutputSchema> => definition;

const sourceSchema = z.object({
  source: z.literal('Discogs'),
  sourceUrl: z.string(),
  retrievedAt: z.string(),
  attribution: z.string(),
});
const paginationSchema = z.object({
  page: z.number().int(),
  perPage: z.number().int(),
  pages: z.number().int(),
  total: z.number().int(),
});
const artistSummarySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  resourceUrl: z.string(),
});
const labelSummarySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  resourceUrl: z.string(),
});
const masterSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  artist: z.string().optional(),
  year: z.number().int().optional(),
  resourceUrl: z.string(),
});
const releaseSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  artist: z.string().optional(),
  year: z.number().int().optional(),
  country: z.string().optional(),
  labels: z.array(z.string()),
  catalogueNumbers: z.array(z.string()),
  formats: z.array(z.string()),
  resourceUrl: z.string(),
});
const artistCreditSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  role: z.string().optional(),
});
const trackSchema = z.object({
  position: z.string(),
  title: z.string(),
  duration: z.string().optional(),
});
const releaseSchema = releaseSummarySchema.extend({
  masterId: z.number().int().optional(),
  artists: z.array(artistCreditSchema),
  labelCredits: z.array(
    z.object({ id: z.number().int(), name: z.string(), catalogueNumber: z.string() }),
  ),
  formatDetails: z.array(
    z.object({
      name: z.string(),
      quantity: z.string(),
      descriptions: z.array(z.string()),
      text: z.string().optional(),
    }),
  ),
  identifiers: z.array(
    z.object({ type: z.string(), value: z.string(), description: z.string().optional() }),
  ),
  tracklist: z.array(trackSchema),
  community: z
    .object({
      have: z.number().int(),
      want: z.number().int(),
      ratingCount: z.number().int(),
      ratingAverage: z.number(),
    })
    .optional(),
  source: sourceSchema,
});
const priceSchema = z.object({ value: z.number(), currency: z.string() });
const page = z.number().int().min(1).max(100).default(1);
const perPage = z.number().int().min(1).max(100).default(25);
const query = z.string().trim().min(1).max(200);
const optionalFilter = z.string().trim().min(1).max(200).optional();
const id = z.number().int().positive();
const pageOutput = <T extends z.ZodType>(schema: T) =>
  z.object({ items: z.array(schema), pagination: paginationSchema, source: sourceSchema });

const paginationInput = { page, perPage };
const searchFilters = {
  artist: optionalFilter,
  title: optionalFilter,
  label: optionalFilter,
  catalogueNumber: optionalFilter,
  barcode: optionalFilter,
  country: optionalFilter,
  year: z.number().int().min(1800).max(2200).optional(),
  format: optionalFilter,
};

export const searchArtistsTool = defineTool({
  name: 'discogs_search_artists',
  title: 'Search Discogs artists',
  summary: 'Search Discogs database artist metadata.',
  description: 'Returns artist candidates without silently selecting one.',
  kind: 'read',
  inputSchema: z.object({ query, ...paginationInput }),
  outputSchema: pageOutput(artistSummarySchema),
  handler: (input, services) => services.catalog.searchArtists(input),
});

export const searchMastersTool = defineTool({
  name: 'discogs_search_masters',
  title: 'Search Discogs masters',
  summary: 'Search Discogs master-release metadata.',
  description: 'Returns paginated master-release candidates.',
  kind: 'read',
  inputSchema: z.object({
    query,
    artist: searchFilters.artist,
    title: searchFilters.title,
    country: searchFilters.country,
    year: searchFilters.year,
    format: searchFilters.format,
    ...paginationInput,
  }),
  outputSchema: pageOutput(masterSummarySchema),
  handler: (input, services) => services.catalog.searchMasters(input),
});

export const searchReleasesTool = defineTool({
  name: 'discogs_search_releases',
  title: 'Search Discogs releases',
  summary: 'Search pressing-level Discogs release metadata.',
  description: 'Returns candidates and never implies that one pressing was definitively identified.',
  kind: 'read',
  inputSchema: z.object({ query, ...searchFilters, ...paginationInput }),
  outputSchema: pageOutput(releaseSummarySchema),
  handler: (input, services) => services.catalog.searchReleases(input),
});

export const searchLabelsTool = defineTool({
  name: 'discogs_search_labels',
  title: 'Search Discogs labels',
  summary: 'Search Discogs label metadata.',
  description: 'Returns paginated label candidates.',
  kind: 'read',
  inputSchema: z.object({ query, ...paginationInput }),
  outputSchema: pageOutput(labelSummarySchema),
  handler: (input, services) => services.catalog.searchLabels(input),
});

export const getReleaseTool = defineTool({
  name: 'discogs_get_release',
  title: 'Get a Discogs release',
  summary: 'Retrieve exact pressing-level metadata by Discogs release ID.',
  description: 'Returns normalized metadata and Discogs attribution; it does not authenticate an item.',
  kind: 'read',
  inputSchema: z.object({ releaseId: id }),
  outputSchema: z.object({ release: releaseSchema }),
  handler: async (input, services) => ({ release: await services.catalog.getRelease(input.releaseId) }),
});

export const getMasterTool = defineTool({
  name: 'discogs_get_master',
  title: 'Get a Discogs master',
  summary: 'Retrieve a master release by Discogs ID.',
  description: 'Returns normalized master metadata and its main release reference.',
  kind: 'read',
  inputSchema: z.object({ masterId: id }),
  outputSchema: z.object({
    master: masterSummarySchema.extend({
      mainReleaseId: z.number().int(),
      artists: z.array(artistCreditSchema),
      tracklist: z.array(trackSchema),
      source: sourceSchema,
    }),
  }),
  handler: async (input, services) => ({ master: await services.catalog.getMaster(input.masterId) }),
});

export const listMasterVersionsTool = defineTool({
  name: 'discogs_list_master_versions',
  title: 'List Discogs master versions',
  summary: 'Find pressing versions belonging to a Discogs master.',
  description: 'Returns version candidates with pressing-identification fields.',
  kind: 'read',
  inputSchema: z.object({
    masterId: id,
    country: optionalFilter,
    label: optionalFilter,
    format: optionalFilter,
    released: z.string().trim().min(1).max(20).optional(),
    ...paginationInput,
  }),
  outputSchema: pageOutput(releaseSummarySchema),
  handler: ({ masterId, ...options }, services) =>
    services.catalog.listMasterVersions(masterId, options),
});

export const getArtistTool = defineTool({
  name: 'discogs_get_artist',
  title: 'Get a Discogs artist',
  summary: 'Retrieve an artist by Discogs ID.',
  description: 'Returns normalized textual artist metadata without images.',
  kind: 'read',
  inputSchema: z.object({ artistId: id }),
  outputSchema: z.object({
    artist: artistSummarySchema.extend({
      realName: z.string().optional(),
      profile: z.string().optional(),
      aliases: z.array(artistSummarySchema),
      source: sourceSchema,
    }),
  }),
  handler: async (input, services) => ({ artist: await services.catalog.getArtist(input.artistId) }),
});

export const getLabelTool = defineTool({
  name: 'discogs_get_label',
  title: 'Get a Discogs label',
  summary: 'Retrieve a label by Discogs ID.',
  description: 'Returns normalized textual label metadata without images.',
  kind: 'read',
  inputSchema: z.object({ labelId: id }),
  outputSchema: z.object({
    label: labelSummarySchema.extend({
      profile: z.string().optional(),
      parentLabel: labelSummarySchema.optional(),
      source: sourceSchema,
    }),
  }),
  handler: async (input, services) => ({ label: await services.catalog.getLabel(input.labelId) }),
});

export const identifyReleaseTool = defineTool({
  name: 'discogs_identify_release',
  title: 'Identify a Discogs release',
  summary: 'Find release candidates from strong pressing evidence.',
  description:
    'Requires a barcode or catalogue-number-plus-label and explicitly reports ambiguous matches.',
  kind: 'read',
  inputSchema: z
    .object(searchFilters)
    .refine((input) => Boolean(input.barcode || (input.catalogueNumber && input.label)), {
      message: 'Provide barcode or both catalogueNumber and label',
    }),
  outputSchema: z.object({
    status: z.enum(['unique_match', 'ambiguous', 'no_match']),
    candidates: z.array(
      z.object({
        release: releaseSummarySchema,
        confidence: z.enum(['high', 'medium', 'low']),
        score: z.number(),
        matchedFields: z.array(z.string()),
        conflictingFields: z.array(z.string()),
        missingFields: z.array(z.string()),
      }),
    ),
    reasonCodes: z.array(z.string()),
    disclaimer: z.string(),
    source: sourceSchema,
  }),
  handler: (input, services) => services.identification.identify(input),
});

export const comparePressingsTool = defineTool({
  name: 'discogs_compare_pressings',
  title: 'Compare Discogs pressings',
  summary: 'Compare two to five explicit Discogs release IDs.',
  description: 'Compares normalized metadata while preserving unknown values.',
  kind: 'read',
  inputSchema: z.object({ releaseIds: z.array(id).min(2).max(5).refine((ids) => new Set(ids).size === ids.length) }),
  outputSchema: z.object({
    releases: z.array(releaseSchema),
    differences: z.array(
      z.object({
        field: z.string(),
        values: z.array(z.union([z.string(), z.number(), z.array(z.string()), z.null()])),
        equal: z.boolean().nullable(),
      }),
    ),
    disclaimer: z.string(),
  }),
  handler: (input, services) => services.comparison.compare(input.releaseIds),
});

export const getMarketplaceStatsTool = defineTool({
  name: 'discogs_get_marketplace_stats',
  title: 'Get Discogs marketplace statistics',
  summary: 'Retrieve current officially supported marketplace statistics for a release.',
  description: 'Feature-gated current asking-price data; never a valuation or sales history.',
  kind: 'read',
  inputSchema: z.object({ releaseId: id, currency: z.string().regex(/^[A-Z]{3}$/).optional() }),
  outputSchema: z.object({
    releaseId: z.number().int(),
    numberForSale: z.number().int(),
    lowestPrice: priceSchema.optional(),
    source: sourceSchema,
    disclaimer: z.string(),
  }),
  handler: (input, services) => services.marketplace.getStats(input.releaseId, input.currency),
});

export const getMarketplaceListingTool = defineTool({
  name: 'discogs_get_marketplace_listing',
  title: 'Get a Discogs marketplace listing',
  summary: 'Retrieve an officially supported live listing by known listing ID.',
  description: 'Feature-gated known-ID retrieval only; this is not marketplace search.',
  kind: 'read',
  inputSchema: z.object({ listingId: id }),
  outputSchema: z.object({
    id: z.number().int(),
    releaseId: z.number().int(),
    title: z.string(),
    condition: z.string(),
    sleeveCondition: z.string().optional(),
    price: priceSchema,
    source: sourceSchema,
    disclaimer: z.string(),
  }),
  handler: (input, services) => services.marketplace.getListing(input.listingId),
});

export const toolDefinitions = [
  searchArtistsTool,
  searchMastersTool,
  searchReleasesTool,
  searchLabelsTool,
  getReleaseTool,
  getMasterTool,
  listMasterVersionsTool,
  getArtistTool,
  getLabelTool,
  identifyReleaseTool,
  comparePressingsTool,
  getMarketplaceStatsTool,
  getMarketplaceListingTool,
] as const satisfies readonly ToolDefinition[];
