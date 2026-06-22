/**
 * GitHub Organization scraper for tracking engineering activity.
 * Monitors repo creation/deletion, language mix, contributor counts,
 * commit cadence, and release frequency.
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";
import { normalizeUrl, computeContentHash } from "./url-normalizer";

/**
 * Signal type representing a GitHub activity event.
 */
export interface GitHubSignal {
  id: string;
  type: "repo_created" | "repo_deleted" | "release_published" | "contributor_activity";
  org: string;
  repo?: string;
  url: string;
  title: string;
  description: string;
  publishedAt: Date;
  metadata: Record<string, string | number | boolean>;
  contentHash: string;
}

/**
 * GitHub API repository object schema.
 */
const GitHubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  html_url: z.string().url(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  size: z.number(),
  archived: z.boolean(),
  disabled: z.boolean(),
});

/**
 * GitHub API release object schema.
 */
const GitHubReleaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  created_at: z.string(),
  published_at: z.string().nullable(),
  html_url: z.string().url(),
  author: z.object({
    login: z.string(),
  }),
});

/**
 * GitHub API contributor object schema.
 */
const GitHubContributorSchema = z.object({
  login: z.string(),
  id: z.number(),
  html_url: z.string().url(),
  contributions: z.number(),
});

/**
 * GitHub API event object schema.
 */
const GitHubEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  created_at: z.string(),
  repo: z.object({
    name: z.string(),
    url: z.string(),
  }),
  actor: z.object({
    login: z.string(),
    display_login: z.string().optional(),
  }),
  payload: z.any(),
});

export class GitHubScraper extends BaseScraper {
  private readonly apiBase = "https://api.github.com";

  constructor() {
    // GitHub API: 5000 requests/hour for authenticated, 60/hour unauthenticated
    // Use conservative rate: 1 request/second
    super(1.0, 30000, 3, 3600); // 1 hour cache
  }

  override get scraperName(): string {
    return "github-scraper";
  }

  /**
   * Scrape GitHub organization for signals.
   * @param org - GitHub organization name
   * @param githubToken - Optional GitHub personal access token for higher rate limits
   */
  async scrape(org: string, githubToken?: string): Promise<GitHubSignal[]> {
    logger.info("Starting GitHub organization scrape", { org });

    const signals: GitHubSignal[] = [];

    try {
      // Fetch organization repos
      const repos = await this.fetchOrgRepos(org, githubToken);
      if (repos) {
        signals.push(...this.processRepos(org, repos));
      }

      // Fetch recent releases for active repos
      const activeRepos = repos?.filter((r) => !r.archived && !r.disabled).slice(0, 10) || [];
      for (const repo of activeRepos) {
        const releases = await this.fetchRepoReleases(repo.full_name, githubToken);
        if (releases && releases.length > 0) {
          signals.push(...this.processReleases(org, repo.full_name, releases));
        }
      }

      // Fetch organization events
      const events = await this.fetchOrgEvents(org, githubToken);
      if (events) {
        signals.push(...this.processEvents(org, events));
      }

      logger.info("GitHub scrape completed", {
        org,
        signalCount: signals.length,
      });
    } catch (error) {
      logger.error("GitHub scrape failed", {
        org,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return signals;
  }

  /**
   * Fetch all repositories for an organization.
   */
  private async fetchOrgRepos(
    org: string,
    token?: string
  ): Promise<z.infer<typeof GitHubRepoSchema>[] | null> {
    const url = `${this.apiBase}/orgs/${org}/repos?per_page=100&sort=updated`;
    const text = await this.fetchWithAuth(url, token);
    if (!text) return null;

    try {
      const data = JSON.parse(text);
      return z.array(GitHubRepoSchema).parse(data);
    } catch (error) {
      logger.error("Failed to parse GitHub repos response", {
        org,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetch releases for a repository.
   */
  private async fetchRepoReleases(
    repoFullName: string,
    token?: string
  ): Promise<z.infer<typeof GitHubReleaseSchema>[] | null> {
    const url = `${this.apiBase}/repos/${repoFullName}/releases?per_page=10`;
    const text = await this.fetchWithAuth(url, token);
    if (!text) return null;

    try {
      const data = JSON.parse(text);
      return z.array(GitHubReleaseSchema).parse(data);
    } catch (error) {
      logger.error("Failed to parse GitHub releases response", {
        repo: repoFullName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetch organization events.
   */
  private async fetchOrgEvents(
    org: string,
    token?: string
  ): Promise<z.infer<typeof GitHubEventSchema>[] | null> {
    const url = `${this.apiBase}/orgs/${org}/events?per_page=30`;
    const text = await this.fetchWithAuth(url, token);
    if (!text) return null;

    try {
      const data = JSON.parse(text);
      return z.array(GitHubEventSchema).parse(data);
    } catch (error) {
      logger.error("Failed to parse GitHub events response", {
        org,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetch with optional GitHub token authentication.
   * Retries on 429/503 with exponential backoff.
   */
  private async fetchWithAuth(url: string, token?: string): Promise<string | null> {
    if (!(await this.canScrape(url))) {
      logger.info("Blocked by robots.txt", { url });
      return null;
    }

    const cached = await this.cache.get(url);
    if (cached !== null) {
      return cached;
    }

    await this.rateLimiter.wait();

    const headers: Record<string, string> = {
      "User-Agent": BaseScraper.USER_AGENT,
      Accept: "application/vnd.github.v3+json",
    };

    if (token) {
      headers.Authorization = `token ${token}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(this.timeout),
        });

        if (response.ok) {
          const text = await response.text();
          await this.cache.set(url, text);
          return text;
        }

        // Handle rate limiting with retry
        if (response.status === 429 || response.status === 503) {
          const retryAfter = response.headers.get("Retry-After");
          const waitTime = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(2 ** attempt * 1000, 60000);

          logger.warn("GitHub API rate limited", {
            url,
            status: response.status,
            waitTime: waitTime / 1000,
            attempt,
          });

          // Consume body to release connection
          await response.body?.cancel();

          if (attempt < this.maxRetries) {
            await new Promise((r) => setTimeout(r, waitTime));
            continue;
          }
        }

        // Consume body to release connection
        await response.body?.cancel();

        logger.warn("GitHub API request failed", {
          url,
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      } catch (error) {
        lastError = error as Error;
        const waitTime = Math.min(2 ** attempt * 1000, 60000);

        logger.warn("GitHub API fetch error", {
          url,
          error: error instanceof Error ? error.message : String(error),
          attempt,
          waitTime: waitTime / 1000,
        });

        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
    }

    logger.error("GitHub API fetch failed after retries", {
      url,
      error: lastError?.message ?? "Unknown error",
    });
    return null;
  }

  /**
   * Process repositories into signals.
   */
  private processRepos(
    org: string,
    repos: z.infer<typeof GitHubRepoSchema>[]
  ): GitHubSignal[] {
    const signals: GitHubSignal[] = [];

    for (const repo of repos) {
      const normalizedUrl = normalizeUrl(repo.html_url);
      const content = JSON.stringify({
        id: repo.id,
        name: repo.name,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
      });

      signals.push({
        id: `github-repo-${repo.id}`,
        type: "repo_created",
        org,
        repo: repo.full_name,
        url: repo.html_url,
        title: `Repository: ${repo.name}`,
        description: repo.description || "No description",
        publishedAt: new Date(repo.created_at),
        metadata: {
          language: repo.language || "unknown",
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          open_issues: repo.open_issues_count,
          size_kb: repo.size,
          archived: repo.archived,
        },
        contentHash: computeContentHash(normalizedUrl, content),
      });
    }

    return signals;
  }

  /**
   * Process releases into signals.
   */
  private processReleases(
    org: string,
    repoFullName: string,
    releases: z.infer<typeof GitHubReleaseSchema>[]
  ): GitHubSignal[] {
    const signals: GitHubSignal[] = [];

    for (const release of releases) {
      if (release.draft) continue; // Skip drafts

      const normalizedUrl = normalizeUrl(release.html_url);
      const content = JSON.stringify({
        id: release.id,
        tag: release.tag_name,
        published_at: release.published_at,
      });

      signals.push({
        id: `github-release-${release.id}`,
        type: "release_published",
        org,
        repo: repoFullName,
        url: release.html_url,
        title: release.name || `Release ${release.tag_name}`,
        description: release.body || "No release notes",
        publishedAt: new Date(release.published_at || release.created_at),
        metadata: {
          tag: release.tag_name,
          prerelease: release.prerelease,
          author: release.author.login,
        },
        contentHash: computeContentHash(normalizedUrl, content),
      });
    }

    return signals;
  }

  /**
   * Process events into signals.
   */
  private processEvents(
    org: string,
    events: z.infer<typeof GitHubEventSchema>[]
  ): GitHubSignal[] {
    const signals: GitHubSignal[] = [];

    for (const event of events) {
      // Only process certain event types
      if (!["CreateEvent", "DeleteEvent", "PushEvent"].includes(event.type)) {
        continue;
      }

      const normalizedUrl = normalizeUrl(`https://github.com/${event.repo.name}`);
      const content = JSON.stringify({
        id: event.id,
        type: event.type,
        created_at: event.created_at,
      });

      let signalType: GitHubSignal["type"];
      let title: string;
      let description: string;

      switch (event.type) {
        case "CreateEvent":
          signalType = "repo_created";
          title = `Repository created: ${event.repo.name}`;
          description = `New repository created by ${event.actor.login}`;
          break;
        case "DeleteEvent":
          signalType = "repo_deleted";
          title = `Repository deleted: ${event.repo.name}`;
          description = `Repository deleted by ${event.actor.login}`;
          break;
        case "PushEvent":
          signalType = "contributor_activity";
          title = `Push to ${event.repo.name}`;
          description = `Code pushed by ${event.actor.login}`;
          break;
        default:
          continue;
      }

      signals.push({
        id: `github-event-${event.id}`,
        type: signalType,
        org,
        repo: event.repo.name,
        url: `https://github.com/${event.repo.name}`,
        title,
        description,
        publishedAt: new Date(event.created_at),
        metadata: {
          actor: event.actor.display_login || event.actor.login,
          eventType: event.type,
        },
        contentHash: computeContentHash(normalizedUrl, content),
      });
    }

    return signals;
  }
}
