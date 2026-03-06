import prisma from "../../lib/prisma";
import { CurrentUser } from "../../context";
import { JobService } from "../job/service";
import { IMessageRepository, MessageQuery } from "./repository";
import { getPubSub, TOPICS } from "../../lib/pubsub";

export class MessageService {
  constructor(
    private readonly repo: IMessageRepository,
    private readonly jobService: JobService,
  ) {}

  async send(jobId: string, content: string, currentUser: CurrentUser, query: MessageQuery = {}) {
    await this.jobService.getJob(jobId, currentUser);

    const message = await this.repo.create(
      { jobId, senderId: currentUser.userId, content },
      prisma,
      query,
    );

    // Fire-and-forget: pub/sub failure must never break the mutation
    getPubSub()
      .publish(TOPICS.MESSAGE_SENT(jobId), message)
      .catch((err: Error) => {
        console.error("[pubsub] Failed to publish message event:", err.message);
      });

    return message;
  }
}
