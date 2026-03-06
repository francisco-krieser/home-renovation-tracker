import { Prisma, Role, User } from "@prisma/client";
import prisma, { TransactionClient } from "../../lib/prisma";

type Client = TransactionClient | typeof prisma;

export type UserQuery = Pick<Prisma.UserFindFirstArgs, "include" | "select">;

export interface IUserRepository {
  findByEmail(email: string, tx?: Client): Promise<User | null>;
  findById(id: string, tx?: Client, query?: UserQuery): Promise<User | null>;
  create(data: { name: string; email: string }, tx?: Client, query?: UserQuery): Promise<User>;
}

export class UserRepository implements IUserRepository {
  findByEmail(email: string, tx: Client = prisma) {
    return tx.user.findFirst({ where: { email } });
  }

  findById(id: string, tx: Client = prisma, query: UserQuery = {}) {
    return tx.user.findFirst({ ...query, where: { id } });
  }

  create(data: { name: string; email: string }, tx: Client = prisma, query: UserQuery = {}) {
    return tx.user.create({
      ...query,
      data: { ...data, role: Role.HOMEOWNER },
    });
  }
}

export const userRepository = new UserRepository();
