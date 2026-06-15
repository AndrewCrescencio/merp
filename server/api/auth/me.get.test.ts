import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("h3", () => ({
  defineEventHandler: (fn: any) => fn,
  createError: (opts: any) => {
    const err = new Error(opts.message);
    (err as any).status = opts.status;
    (err as any).statusCode = opts.status;
    throw err;
  },
}));

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user info when authenticated", async () => {
    const handler = await import("~~/server/api/auth/me.get").then(m => m.default);

    const event = {
      context: {
        user: {
          id: "uuid-123",
          email: "user@example.com",
          name: "Test User",
        },
      },
    } as any;

    const result = await handler(event);

    expect(result).toEqual({
      id: "uuid-123",
      email: "user@example.com",
      name: "Test User",
      activeCompanyId: null,
      companies: [],
    });
  });

  it("returns null name when user has no name", async () => {
    const handler = await import("~~/server/api/auth/me.get").then(m => m.default);

    const event = {
      context: {
        user: {
          id: "uuid-123",
          email: "user@example.com",
          name: null,
        },
      },
    } as any;

    const result = await handler(event);

    expect(result).toEqual({
      id: "uuid-123",
      email: "user@example.com",
      name: null,
      activeCompanyId: null,
      companies: [],
    });
  });

  it("throws 401 when user is not authenticated", async () => {
    const handler = await import("~~/server/api/auth/me.get").then(m => m.default);

    const event = { context: {} } as any;

    await expect(handler(event)).rejects.toThrow("Authentication required.");
  });

  it("throws 401 when user is undefined", async () => {
    const handler = await import("~~/server/api/auth/me.get").then(m => m.default);

    const event = { context: { user: undefined } } as any;

    await expect(handler(event)).rejects.toThrow("Authentication required.");
  });

  it("returns empty companies and null activeCompanyId", async () => {
    const handler = await import("~~/server/api/auth/me.get").then(m => m.default);

    const event = {
      context: {
        user: {
          id: "uuid-123",
          email: "user@example.com",
          name: "Test User",
        },
      },
    } as any;

    const result = await handler(event);

    expect(result.activeCompanyId).toBeNull();
    expect(result.companies).toEqual([]);
  });
});
