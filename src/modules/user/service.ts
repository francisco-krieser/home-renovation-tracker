import jwt from "jsonwebtoken";
import { env, JWT_EXPIRY } from "../../config/env";
import { UnauthorizedError } from "../../errors/appErrors";
import { IUserRepository } from "./repository";

// TODO: replace with a real password hashing and verification implementation
const DEV_MOCK_PASSWORD = "mock123";

export class UserService {
  constructor(private readonly repo: IUserRepository) {}

  async login(email: string, password: string) {
    if (password !== DEV_MOCK_PASSWORD) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const user = await this.repo.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, env.JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });

    return { token, role: user.role, user };
  }
}
