import { badRequest } from '../errors.js';
import type {
  MusicMarketplaceProvider,
  Release,
  ReleaseCandidate,
  ReleaseEvidence,
  ReleaseIdentificationResult,
  ReleaseSummary,
} from '../provider/types.js';

const normalize = (value: string): string =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
const same = (left: string, right: string): boolean => normalize(left) === normalize(right);
const includes = (values: readonly string[], expected: string): boolean =>
  values.some((value) => same(value, expected));

export class IdentificationService {
  public constructor(private readonly provider: MusicMarketplaceProvider) {}

  public async identify(evidence: ReleaseEvidence): Promise<ReleaseIdentificationResult> {
    if (!evidence.barcode && !(evidence.catalogueNumber && evidence.label)) {
      throw badRequest('Provide a barcode or both catalogueNumber and label');
    }
    const query = [
      evidence.artist,
      evidence.title,
      evidence.label,
      evidence.catalogueNumber,
      evidence.barcode,
    ]
      .filter(Boolean)
      .join(' ');
    const page = await this.provider.searchReleases({
      query,
      page: 1,
      perPage: 10,
      ...(evidence.artist ? { artist: evidence.artist } : {}),
      ...(evidence.title ? { title: evidence.title } : {}),
      ...(evidence.label ? { label: evidence.label } : {}),
      ...(evidence.catalogueNumber ? { catalogueNumber: evidence.catalogueNumber } : {}),
      ...(evidence.barcode ? { barcode: evidence.barcode } : {}),
      ...(evidence.country ? { country: evidence.country } : {}),
      ...(evidence.year ? { year: evidence.year } : {}),
      ...(evidence.format ? { format: evidence.format } : {}),
    });
    const detailed = await Promise.all(
      page.items.slice(0, 10).map((item) => this.provider.getRelease(item.id)),
    );
    const candidates = detailed
      .map((release) => this.evaluate(release, evidence))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.release.id - right.release.id);
    const credible = candidates.filter(
      (candidate) => candidate.conflictingFields.length === 0 && candidate.score >= 70,
    );
    if (credible.length === 1 && (candidates[1]?.score ?? 0) < credible[0]!.score) {
      return {
        status: 'unique_match',
        candidates,
        reasonCodes: ['ONE_STRONG_CANDIDATE'],
        disclaimer: this.disclaimer(),
        source: page.source,
      };
    }
    if (credible.length > 0 || candidates.length > 1) {
      return {
        status: 'ambiguous',
        candidates,
        reasonCodes: ['MULTIPLE_PLAUSIBLE_CANDIDATES'],
        disclaimer: this.disclaimer(),
        source: page.source,
      };
    }
    return {
      status: 'no_match',
      candidates,
      reasonCodes: ['NO_CANDIDATE_SATISFIED_STRICT_EVIDENCE'],
      disclaimer: this.disclaimer(),
      source: page.source,
    };
  }

  private evaluate(release: Release, evidence: ReleaseEvidence): ReleaseCandidate {
    const matched: string[] = [];
    const conflicts: string[] = [];
    const missing: string[] = [];
    let score = 0;
    const assess = (
      field: string,
      expected: string | number | undefined,
      actual: string | number | readonly string[] | undefined,
      weight: number,
    ) => {
      if (expected === undefined) return;
      if (actual === undefined || (Array.isArray(actual) && actual.length === 0)) {
        missing.push(field);
        return;
      }
      const matches = Array.isArray(actual)
        ? includes(actual as readonly string[], String(expected))
        : same(String(actual), String(expected));
      if (matches) {
        matched.push(field);
        score += weight;
      } else {
        conflicts.push(field);
        score -= weight;
      }
    };
    assess(
      'barcode',
      evidence.barcode,
      release.identifiers
        .filter((entry) => entry.type.toLowerCase() === 'barcode')
        .map((entry) => entry.value),
      70,
    );
    assess('catalogueNumber', evidence.catalogueNumber, release.catalogueNumbers, 45);
    assess('label', evidence.label, release.labels, 30);
    assess('country', evidence.country, release.country, 10);
    assess('year', evidence.year, release.year, 10);
    assess('format', evidence.format, release.formats, 10);
    assess('artist', evidence.artist, release.artist, 10);
    assess('title', evidence.title, release.title, 10);
    const summary: ReleaseSummary = {
      id: release.id,
      title: release.title,
      ...(release.artist ? { artist: release.artist } : {}),
      ...(release.year ? { year: release.year } : {}),
      ...(release.country ? { country: release.country } : {}),
      labels: release.labels,
      catalogueNumbers: release.catalogueNumbers,
      formats: release.formats,
      resourceUrl: release.resourceUrl,
    };
    return {
      release: summary,
      confidence: score >= 70 && conflicts.length === 0 ? 'high' : score >= 40 ? 'medium' : 'low',
      score,
      matchedFields: matched,
      conflictingFields: conflicts,
      missingFields: missing,
    };
  }

  private disclaimer(): string {
    return 'Metadata matching does not authenticate a physical item or establish completeness, ownership, or value.';
  }
}
