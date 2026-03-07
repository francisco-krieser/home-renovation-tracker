import { Message, Prisma } from "@prisma/client";
import prisma, { TransactionClient } from "../../lib/prisma";

type Client = TransactionClient | typeof prisma;

export type MessageQuery = Pick<Prisma.MessageFindFirstArgs, "include" | "select">;

export interface IMessageRepository {
  create(
    data: { jobId: string; senderId: string; content: string },
    tx?: Client,
    query?: MessageQuery,
  ): Promise<Message>;
}

export class MessageRepository implements IMessageRepository {
  create(
    data: { jobId: string; senderId: string; content: string },
    tx: Client = prisma,
    query: MessageQuery = {},
  ) {
    return tx.message.create({ ...query, data });
  }
}

export const messageRepository = new MessageRepository();
