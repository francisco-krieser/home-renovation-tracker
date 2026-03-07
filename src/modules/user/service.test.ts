import { Role } from "@prisma/client";
import { UserService } from "./service";
import { IUserRepository } from "./repository";
import { UnauthorizedError } from "../../errors/appErrors";

jest.mock("../../config/env", () => ({
  env: { JWT_SECRET: "test-secret" },
  JWT_EXPIRY: "7d",
}));

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  role: Role.CONTRACTOR,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

describe("UserService", () => {
  let userRepo: jest.Mocked<IUserRepository>;
  let service: UserService;

  beforeEach(() => {
    userRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    service = new UserService(userRepo);
  });

  describe("login", () => {
    it("returns token, role, and user for valid credentials", async () => {
      const user = makeUser() as any;
      userRepo.findByEmail.mockResolvedValue(user);

      const result = await service.login("test@example.com", "mock123");

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
      expect(result.role).toBe(Role.CONTRACTOR);
      expect(result.user).toBe(user);
      expect(userRepo.findByEmail).toHaveBeenCalledWith("test@example.com");
    });

    it("returns a homeowner role token correctly", async () => {
      const user = makeUser({ role: Role.HOMEOWNER }) as any;
      userRepo.findByEmail.mockResolvedValue(user);

      const result = await service.login("test@example.com", "mock123");

      expect(result.role).toBe(Role.HOMEOWNER);
    });

    it("throws UnauthorizedError for wrong password without calling repo", async () => {
      await expect(service.login("test@example.com", "wrong")).rejects.toThrow(UnauthorizedError);
      expect(userRepo.findByEmail).not.toHaveBeenCalled();
    });

    it("throws UnauthorizedError when user does not exist", async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(service.login("none@example.com", "mock123")).rejects.toThrow(UnauthorizedError);
    });
  });
});
