import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRegister = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockSendValidationError = vi.fn();
const mockSetResponseStatus = vi.fn();
const mockReadBody = vi.fn();

vi.mock("h3", () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: mockReadBody,
  setResponseStatus: mockSetResponseStatus,
  createError: (opts: any) => {
    const err = new Error(opts.message);
    (err as any).status = opts.status;
    (err as any).statusCode = opts.status;
    throw err;
  },
}));

vi.mock("~~/server/utils/auth/repository", () => ({
  authRepository: { register: mockRegister },
}));

vi.mock("~~/server/utils/auth/helpers", () => ({
  checkRateLimit: mockCheckRateLimit,
  sendValidationError: mockSendValidationError,
}));

vi.mock("#shared/auth", () => ({
  auth: { api: {} },
}));

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendValidationError.mockImplementation((msg: string) => {
      throw new Error(msg);
    });
  });

  it("validates email is required", async () => {
    mockReadBody.mockResolvedValue({});

    const handler = await import("~~/server/api/auth/register.post").then(m => m.default);

    await expect(handler({} as any)).rejects.toThrow("Valid email is required");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("validates email format", async () => {
    mockReadBody.mockResolvedValue({ email: "invalid", password: "password123" });

    const handler = await import("~~/server/api/auth/register.post").then(m => m.default);

    await expect(handler({} as any)).rejects.toThrow("Valid email is required");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("validates password minimum length", async () => {
    mockReadBody.mockResolvedValue({ email: "user@example.com", password: "123" });

    const handler = await import("~~/server/api/auth/register.post").then(m => m.default);

    await expect(handler({} as any)).rejects.toThrow("Password must be at least 8 characters");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("calls checkRateLimit with email", async () => {
    mockReadBody.mockResolvedValue({ email: "user@example.com", password: "password123" });
    mockRegister.mockResolvedValue({ id: "uuid", email: "user@example.com", name: null, createdAt: new Date() });

    const handler = await import("~~/server/api/auth/register.post").then(m => m.default);
    const event = {} as any;

    await handler(event);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(event, "user@example.com");
  });

  it("returns 201 with user data on successful registration", async () => {
    mockReadBody.mockResolvedValue({ email: "user@example.com", password: "password123" });
    const createdAt = new Date("2026-01-01");
    mockRegister.mockResolvedValue({ id: "uuid-123", email: "user@example.com", name: "Test User", createdAt });

    const handler = await import("~~/server/api/auth/register.post").then(m => m.default);

    const result = await handler({} as any);

    expect(result).toEqual({
      id: "uuid-123",
      email: "user@example.com",
      name: "Test User",
      createdAt,
    });
    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 201);
  });

  it("returns 201 without name when name is not provided", async () => {
    mockReadBody.mockResolvedValue({ email: "user@example.com", password: "password123" });
    const createdAt = new Date("2026-01-01");
    mockRegister.mockResolvedValue({ id: "uuid-123", email: "user@example.com", name: null, createdAt });

    const handler = await import("~~/server/api/auth/register.post").then(m => m.default);

    const result = await handler({} as any);

    expect(result).toEqual({
      id: "uuid-123",
      email: "user@example.com",
      name: null,
      createdAt,
    });
  });

  it("registers with optional name", async () => {
    mockReadBody.mockResolvedValue({ email: "user@example.com", password: "password123", name: "Alice" });
    const createdAt = new Date("2026-01-01");
    mockRegister.mockResolvedValue({ id: "uuid-123", email: "user@example.com", name: "Alice", createdAt });

    const handler = await import("~~/server/api/auth/register.post").then(m => m.default);

    const result = await handler({} as any);

    expect(mockRegister).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
      name: "Alice",
    });
    expect(result).toHaveProperty("name", "Alice");
  });
});
