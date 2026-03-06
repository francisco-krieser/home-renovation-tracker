import prisma from "../../lib/prisma";
import { CurrentUser } from "../../context";
import { JobService } from "../job/service";
import { IMessageRepository, MessageQuery } from "./repository";

export class MessageService {
  constructor(
    private readonly repo: IMessageRepository,
    private readonly jobService: JobService,
  ) {}

  async send(jobId: string, content: string, currentUser: CurrentUser, query: MessageQuery = {}) {
    await this.jobService.getJob(jobId, currentUser);

    return this.repo.create({ jobId, senderId: currentUser.userId, content }, prisma, query);
  }
}
