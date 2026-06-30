/**
 * Academic paper scraper for tracking R&D signals and researcher movements.
 * Sources: OpenAlex API (250M+ works, CC0), Semantic Scholar (200M+ papers), NBER via Crossref.
 * 
 * Signal value: R&D direction 2-5 years ahead of products, key researcher movements,
 * technology trends, corporate research focus.
 * 
 * @see https://docs.openalex.org/
 * @see https://api.semanticscholar.org/
 * @see https://www.crossref.org/api/
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

const OPENALEX_API_BASE = "https://api.openalex.org";
const SEMANTIC_SCHOLAR_API_BASE = "https://api.semanticscholar.org/graph/v1";
const CROSSREF_API_BASE = "https://api.crossref.org";

const OpenAlexWorkSchema = z.object({
  id: z.string(),
  doi: z.string().nullable(),
  title: z.string().nullable(),
  publication_year: z.number().nullable(),
  publication_date: z.string().nullable(),
  cited_by_count: z.number().optional(),
  abstract_inverted_index: z.record(z.string(), z.array(z.number())).nullable().optional(),
  authorships: z.array(z.object({
    author: z.object({
      id: z.string(),
      display_name: z.string(),
    }),
    institutions: z.array(z.object({
      id: z.string(),
      display_name: z.string(),
      ror: z.string().nullable().optional(),
    })),
  })),
  concepts: z.array(z.object({
    id: z.string(),
    display_name: z.string(),
    score: z.number().optional(),
  })).optional(),
  primary_location: z.object({
    source: z.object({
      display_name: z.string().nullable(),
      type: z.string().nullable(),
    }).nullable(),
  }).nullable().optional(),
  type: z.string().optional(),
});

const SemanticScholarPaperSchema = z.object({
  paperId: z.string(),
  title: z.string().nullable(),
  abstract: z.string().nullable(),
  year: z.number().nullable(),
  publicationDate: z.string().nullable(),
  citationCount: z.number().optional(),
  authors: z.array(z.object({
    authorId: z.string(),
    name: z.string(),
    affiliations: z.array(z.string()).optional(),
  })),
  fieldsOfStudy: z.array(z.string()).optional(),
  venue: z.string().nullable().optional(),
  externalIds: z.object({
    DOI: z.string().nullable().optional(),
    ArXiv: z.string().nullable().optional(),
    CorpusId: z.number().optional(),
  }).optional(),
});

const CrossrefWorkSchema = z.object({
  DOI: z.string(),
  title: z.array(z.string()).optional(),
  author: z.array(z.object({
    given: z.string().optional(),
    family: z.string().optional(),
    affiliation: z.array(z.object({
      name: z.string(),
    })).optional(),
  })).optional(),
  issued: z.object({
    "date-parts": z.array(z.array(z.number().nullable())),
  }).optional(),
  "abstract": z.string().optional(),
  "container-title": z.array(z.string()).optional(),
  "is-referenced-by-count": z.number().optional(),
  subject: z.array(z.string()).optional(),
  type: z.string().optional(),
});

export type OpenAlexWork = z.infer<typeof OpenAlexWorkSchema>;
export type SemanticScholarPaper = z.infer<typeof SemanticScholarPaperSchema>;
export type CrossrefWork = z.infer<typeof CrossrefWorkSchema>;

export interface AcademicSignal {
  id: string;
  source: "openalex" | "semantic_scholar" | "nber";
  title: string;
  url: string;
  doi: string | null;
  publishedAt: Date | null;
  abstract: string;
  authors: Array<{
    name: string;
    affiliations: string[];
  }>;
  citationCount: number;
  fieldsOfStudy: string[];
  metadata: {
    venue?: string;
    paperType?: string;
    concepts: string[];
  };
}

export interface AcademicSearchOptions {
  query?: string;
  authorAffiliation?: string;
  year?: number;
  fromYear?: number;
  toYear?: number;
  limit?: number;
  offset?: number;
}

export class AcademicScraper extends BaseScraper {
  constructor() {
    super(2.0, 30000, 3, 86400);
  }

  override get scraperName(): string {
    return "academic-scraper";
  }

  /**
   * Search OpenAlex for academic works by keyword or author affiliation.
   */
  async searchOpenAlex(options: AcademicSearchOptions): Promise<AcademicSignal[]> {
    const { query, authorAffiliation, fromYear, toYear, limit = 50, offset = 0 } = options;

    const params = new URLSearchParams({
      "per-page": String(Math.min(limit, 200)),
      page: String(Math.floor(offset / Math.min(limit, 200)) + 1),
      select: "id,doi,title,publication_year,publication_date,cited_by_count,abstract_inverted_index,authorships,concepts,primary_location,type",
    });

    const filters: string[] = [];
    if (fromYear) {
      filters.push(`from_publication_year:${fromYear}`);
    }
    if (toYear) {
      filters.push(`to_publication_year:${toYear}`);
    }
    if (filters.length > 0) {
      params.set("filter", filters.join(","));
    }

    let searchUrl: string;
    if (authorAffiliation) {
      searchUrl = `${OPENALEX_API_BASE}/works?${params.toString()}&authorships.institutions.display_name.search=${encodeURIComponent(authorAffiliation)}`;
    } else if (query) {
      searchUrl = `${OPENALEX_API_BASE}/works?${params.toString()}&search=${encodeURIComponent(query)}`;
    } else {
      logger.warn("OpenAlex search requires either query or authorAffiliation");
      return [];
    }

    logger.info("Searching OpenAlex", { query, authorAffiliation, limit });

    const text = await this.fetch(searchUrl);
    if (!text) {
      return [];
    }

    try {
      const data = JSON.parse(text) as {
        results?: Array<OpenAlexWork>;
      };

      if (!data.results) {
        return [];
      }

      return data.results
        .filter((work) => work.title !== null)
        .map((work) => this.mapOpenAlexToSignal(work));
    } catch (error) {
      logger.error("Failed to parse OpenAlex response", { error: String(error) });
      return [];
    }
  }

  /**
   * Search Semantic Scholar for papers by keyword or author affiliation.
   */
  async searchSemanticScholar(options: AcademicSearchOptions): Promise<AcademicSignal[]> {
    const { query, authorAffiliation, year, fromYear, toYear, limit = 50, offset = 0 } = options;

    const params = new URLSearchParams({
      query: query || "",
      limit: String(Math.min(limit, 100)),
      offset: String(offset),
      fields: "paperId,title,abstract,year,publicationDate,citationCount,authors,fieldsOfStudy,venue,externalIds",
    });

    if (year) {
      params.set("year", String(year));
    } else if (fromYear && toYear) {
      params.set("year", `${fromYear}-${toYear}`);
    }

    const searchUrl = `${SEMANTIC_SCHOLAR_API_BASE}/paper/search?${params.toString()}`;

    logger.info("Searching Semantic Scholar", { query, limit });

    const text = await this.fetch(searchUrl);
    if (!text) {
      return [];
    }

    try {
      const data = JSON.parse(text) as {
        data?: Array<SemanticScholarPaper>;
        total?: number;
      };

      if (!data.data) {
        return [];
      }

      let results = data.data
        .filter((paper) => paper.title !== null)
        .map((paper) => this.mapSemanticScholarToSignal(paper));

      if (authorAffiliation) {
        results = results.filter((signal) =>
          signal.authors.some((author) =>
            author.affiliations.some((aff) =>
              aff.toLowerCase().includes(authorAffiliation.toLowerCase())
            )
          )
        );
      }

      return results;
    } catch (error) {
      logger.error("Failed to parse Semantic Scholar response", { error: String(error) });
      return [];
    }
  }

  /**
   * Search NBER working papers via Crossref API.
   * NBER papers have DOI prefix 10.3386.
   */
  async searchNBER(options: AcademicSearchOptions): Promise<AcademicSignal[]> {
    const { query, fromYear, toYear, limit = 50, offset = 0 } = options;

    const params = new URLSearchParams({
      "query": query || "",
      "rows": String(Math.min(limit, 100)),
      "offset": String(offset),
      "select": "DOI,title,author,issued,abstract,container-title,is-referenced-by-count,subject,type",
    });

    const filters: string[] = ["prefix:10.3386"];
    if (fromYear) {
      filters.push(`from-pub-year:${fromYear}`);
    }
    if (toYear) {
      filters.push(`until-pub-year:${toYear}`);
    }

    if (filters.length > 0) {
      params.set("filter", filters.join(","));
    }

    const searchUrl = `${CROSSREF_API_BASE}/works?${params.toString()}`;

    logger.info("Searching NBER papers via Crossref", { query, limit });

    const text = await this.fetch(searchUrl);
    if (!text) {
      return [];
    }

    try {
      const data = JSON.parse(text) as {
        message?: {
          items?: Array<CrossrefWork>;
          "total-results"?: number;
        };
      };

      if (!data.message?.items) {
        return [];
      }

      return data.message.items.map((work) => this.mapCrossrefToSignal(work));
    } catch (error) {
      logger.error("Failed to parse Crossref response", { error: String(error) });
      return [];
    }
  }

  /**
   * Main scrape method - searches all academic sources.
   * Returns combined signals from OpenAlex, Semantic Scholar, and NBER.
   */
  async scrape(options: AcademicSearchOptions): Promise<AcademicSignal[]> {
    const [openalex, semantic, nber] = await Promise.all([
      this.searchOpenAlex(options),
      this.searchSemanticScholar(options),
      this.searchNBER(options),
    ]);

    const allSignals = [...openalex, ...semantic, ...nber];

    logger.info("Academic scrape complete", {
      query: options.query,
      authorAffiliation: options.authorAffiliation,
      openalex: openalex.length,
      semanticScholar: semantic.length,
      nber: nber.length,
      total: allSignals.length,
    });

    return allSignals;
  }

  /**
   * Reconstruct abstract from OpenAlex inverted index.
   */
  private reconstructAbstract(invertedIndex: Record<string, number[]>): string {
    const wordPositions: Array<{ word: string; position: number }> = [];

    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const position of positions) {
        wordPositions.push({ word, position });
      }
    }

    wordPositions.sort((a, b) => a.position - b.position);

    return wordPositions.map((wp) => wp.word).join(" ");
  }

  private mapOpenAlexToSignal(work: OpenAlexWork): AcademicSignal {
    const authors = work.authorships.map((authorship) => ({
      name: authorship.author.display_name,
      affiliations: authorship.institutions.map((inst) => inst.display_name),
    }));

    const abstract = work.abstract_inverted_index
      ? this.reconstructAbstract(work.abstract_inverted_index as Record<string, number[]>)
      : "";

    const concepts = (work.concepts || [])
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 10)
      .map((c) => c.display_name);

    return {
      id: `openalex-${work.id}`,
      source: "openalex",
      title: work.title || "Untitled",
      url: work.doi ? `https://doi.org/${work.doi}` : work.id,
      doi: work.doi,
      publishedAt: work.publication_date
        ? new Date(work.publication_date)
        : work.publication_year
          ? new Date(`${work.publication_year}-01-01`)
          : null,
      abstract,
      authors,
      citationCount: work.cited_by_count || 0,
      fieldsOfStudy: concepts,
      metadata: {
        venue: work.primary_location?.source?.display_name || undefined,
        paperType: work.type,
        concepts,
      },
    };
  }

  private mapSemanticScholarToSignal(paper: SemanticScholarPaper): AcademicSignal {
    const authors = paper.authors.map((author) => ({
      name: author.name,
      affiliations: author.affiliations || [],
    }));

    return {
      id: `semantic-scholar-${paper.paperId}`,
      source: "semantic_scholar",
      title: paper.title || "Untitled",
      url: paper.externalIds?.DOI
        ? `https://doi.org/${paper.externalIds.DOI}`
        : `https://www.semanticscholar.org/paper/${paper.paperId}`,
      doi: paper.externalIds?.DOI || null,
      publishedAt: paper.publicationDate
        ? new Date(paper.publicationDate)
        : paper.year
          ? new Date(`${paper.year}-01-01`)
          : null,
      abstract: paper.abstract || "",
      authors,
      citationCount: paper.citationCount || 0,
      fieldsOfStudy: paper.fieldsOfStudy || [],
      metadata: {
        venue: paper.venue || undefined,
        concepts: paper.fieldsOfStudy || [],
      },
    };
  }

  private mapCrossrefToSignal(work: CrossrefWork): AcademicSignal {
    const authors = (work.author || []).map((author) => ({
      name: `${author.given || ""} ${author.family || ""}`.trim(),
      affiliations: (author.affiliation || []).map((aff) => aff.name),
    }));

    const title = work.title?.[0] || "Untitled";
    const abstract = this.cleanAbstract(work.abstract || "");

    const year = work.issued?.["date-parts"]?.[0]?.[0];
    const publishedAt = year ? new Date(`${year}-01-01`) : null;

    return {
      id: `nber-${work.DOI}`,
      source: "nber",
      title,
      url: `https://doi.org/${work.DOI}`,
      doi: work.DOI,
      publishedAt,
      abstract,
      authors,
      citationCount: work["is-referenced-by-count"] || 0,
      fieldsOfStudy: work.subject || [],
      metadata: {
        venue: work["container-title"]?.[0],
        paperType: work.type,
        concepts: work.subject || [],
      },
    };
  }

  private cleanAbstract(abstract: string): string {
    return abstract
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .trim();
  }
}
