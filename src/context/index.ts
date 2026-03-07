import type { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { UnauthorizedError } from "../errors/appErrors";
import { JobService } from "../modules/job/service";
import { UserService } from "../modules/user/service";
import { MessageService } from "../modules/message/service";
import { jobRepository } from "../modules/job/repository";
import { jobHistoryRepository } from "../modules/job/history.repository";
import { userRepository } from "../modules/user/repository";
import { messageRepository } from "../modules/message/repository";

export interface CurrentUser {
  userId: string;
  role: Role;
}

export interface Context {
  currentUser: CurrentUser | null;
  services: {
    job: JobService;
    user: UserService;
    message: MessageService;
  };
}

export function requireCurrentUser(ctx: Context): CurrentUser {
  if (!ctx.currentUser) throw new UnauthorizedError();
  return ctx.currentUser;
}

// Services are stateless — instantiate once and reuse across all requests
const jobService = new JobService(jobRepository, userRepository, jobHistoryRepository);
const userService = new UserService(userRepository);
const messageService = new MessageService(messageRepository, jobService);
const services = { job: jobService, user: userService, message: messageService };

interface JwtPayload {
  userId: string;
  role: Role;
}

async function buildContextFromToken(token: string | undefined): Promise<Context> {
  if (!token) return { currentUser: null, services };

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const foundUser = await userRepository.findById(payload.userId);
    if (!foundUser) return { currentUser: null, services };
    return { currentUser: { userId: foundUser.id, role: foundUser.role }, services };
  } catch {
    return { currentUser: null, services };
  }
}

export async function buildContext(req: IncomingMessage): Promise<Context> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return { currentUser: null, services };
  }
  return buildContextFromToken(authHeader.slice(7));
}

export async function buildWsContext(ctx: {
  connectionParams?: Record<string, unknown>;
}): Promise<Context> {
  const auth = ctx.connectionParams?.authorization;
  const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
  return buildContextFromToken(token);
}
