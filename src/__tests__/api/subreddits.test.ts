/**
 * Integration tests for the subreddit API routes.
 *
 * Tests GET/POST /api/v1/companies/[id]/subreddits,
 * DELETE /api/v1/companies/[id]/subreddits/[subredditId],
 * POST /api/v1/companies/[id]/subreddits/discover.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Hoist mocks so they can be referenced by vi.mock factories.
const { mockPrisma, mockAuth, mockValidateSubreddit, mockInngestSend } = vi.hoisted(() => {
  const mockPrisma = {
    company: { findUnique: vi.fn() },
    trackedSubreddit: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    subredditDiscoveryLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  const mockAuth = vi.fn();
  const mockValidateSubreddit = vi.fn();
  const mockInngestSend = vi.fn();
  return { mockPrisma, mockAuth, mockValidateSubreddit, mockInngestSend };
});

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/reddit/subreddit-discovery", () => ({
  validateSubreddit: (...args: unknown[]) => mockValidateSubreddit(...args),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
}));

import { GET, POST } from "@/app/api/v1/companies/[id]/subreddits/route";
import { DELETE } from "@/app/api/v1/companies/[id]/subreddits/[subredditId]/route";

const COMPANY_ID = "company-123";
const SUBREDDIT_ID = "tracked-sub-456";

function makeRequest(url: string, options: RequestInit = {}): NextRequest {
  return new NextRequest(url, options);
}

function makeParams(overrides: Record<string, string> = {}) {
  return Promise.resolve({ id: COMPANY_ID, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "user-1", email: "admin@thetell.com" } });
  mockPrisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, name: "Moderna" });
});

describe("GET /api/v1/companies/[id]/subreddits", () => {
  it("returns tracked subreddits for a company", async () => {
    const mockItems = [
      { id: "1", subreddit: "biotech", companyId: COMPANY_ID, isActive: true },
      { id: "2", subreddit: "mrna", companyId: COMPANY_ID, isActive: true },
    ];
    mockPrisma.trackedSubreddit.findMany.mockResolvedValue(mockItems);
    mockPrisma.subredditDiscoveryLog.findFirst.mockResolvedValue({
      status: "success",
      suggestedCount: 5,
      validatedCount: 3,
      createdAt: new Date(),
    });

    const req = makeRequest(`http://localhost/api/v1/companies/${COMPANY_ID}/subreddits`);
    const res = await GET(req, { params: makeParams() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].subreddit).toBe("biotech");
    expect(body.discoveryLog).toBeDefined();
    expect(body.discoveryLog.status).toBe("success");
  });

  it("returns 401 for unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);

    const req = makeRequest(`http://localhost/api/v1/companies/${COMPANY_ID}/subreddits`);
    const res = await GET(req, { params: makeParams() });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });
});

describe("POST /api/v1/companies/[id]/subreddits", () => {
  it("adds a valid subreddit", async () => {
    mockValidateSubreddit.mockResolvedValue({ valid: true, subscriberCount: 50000 });
    mockPrisma.trackedSubreddit.create.mockResolvedValue({
      id: "new-sub-1",
      companyId: COMPANY_ID,
      subreddit: "biotech",
      subscriberCount: 50000,
      isActive: true,
    });

    const req = makeRequest(`http://localhost/api/v1/companies/${COMPANY_ID}/subreddits`, {
      method: "POST",
      body: JSON.stringify({ subreddit: "biotech" }),
    });
    const res = await POST(req, { params: makeParams() });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.subreddit).toBe("biotech");
    expect(mockValidateSubreddit).toHaveBeenCalledWith("biotech");
    expect(mockPrisma.trackedSubreddit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: COMPANY_ID,
          subreddit: "biotech",
        }),
      })
    );
  });

  it("rejects invalid subreddit (RSS returns 404)", async () => {
    mockValidateSubreddit.mockResolvedValue({ valid: false });

    const req = makeRequest(`http://localhost/api/v1/companies/${COMPANY_ID}/subreddits`, {
      method: "POST",
      body: JSON.stringify({ subreddit: "fake_subreddit_xyz" }),
    });
    const res = await POST(req, { params: makeParams() });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_subreddit");
    expect(mockPrisma.trackedSubreddit.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate subreddit (unique constraint)", async () => {
    mockValidateSubreddit.mockResolvedValue({ valid: true });

    const prismaError = new Error("Unique constraint failed") as Error & { code: string };
    prismaError.code = "P2002";
    mockPrisma.trackedSubreddit.create.mockRejectedValue(prismaError);

    const req = makeRequest(`http://localhost/api/v1/companies/${COMPANY_ID}/subreddits`, {
      method: "POST",
      body: JSON.stringify({ subreddit: "biotech" }),
    });
    const res = await POST(req, { params: makeParams() });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("conflict");
  });
});

describe("DELETE /api/v1/companies/[id]/subreddits/[subredditId]", () => {
  it("removes a tracked subreddit", async () => {
    mockPrisma.trackedSubreddit.findUnique.mockResolvedValue({
      id: SUBREDDIT_ID,
      companyId: COMPANY_ID,
      subreddit: "biotech",
    });
    mockPrisma.trackedSubreddit.delete.mockResolvedValue({});

    const req = makeRequest(
      `http://localhost/api/v1/companies/${COMPANY_ID}/subreddits/${SUBREDDIT_ID}`,
      { method: "DELETE" }
    );
    const res = await DELETE(req, {
      params: makeParams({ subredditId: SUBREDDIT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.trackedSubreddit.delete).toHaveBeenCalledWith({
      where: { id: SUBREDDIT_ID },
    });
  });
});

describe("POST /api/v1/companies/[id]/subreddits/discover", () => {
  it("triggers Inngest event", async () => {
    mockInngestSend.mockResolvedValue({ ids: ["event-1"] });

    const { POST: discoverPOST } = await import(
      "@/app/api/v1/companies/[id]/subreddits/discover/route"
    );

    const req = makeRequest(
      `http://localhost/api/v1/companies/${COMPANY_ID}/subreddits/discover`,
      { method: "POST" }
    );
    const res = await discoverPOST(req, { params: makeParams() });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.message).toBe("Discovery started");
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "company.subreddits.discover",
      data: { companyId: COMPANY_ID },
    });
  });
});
