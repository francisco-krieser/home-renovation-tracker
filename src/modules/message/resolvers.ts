import type { Message } from "@prisma/client";
import { builder } from "../../graphql/builder";
import { requireCurrentUser } from "../../context";
import { getPubSub, TOPICS } from "../../lib/pubsub";

// ── Types ────────────────────────────────────────────────────────────────────

export const MessageRef = builder.prismaObject("Message", {
  fields: (t) => ({
    id: t.exposeID("id"),
    jobId: t.exposeID("jobId"),
    content: t.exposeString("content"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    sender: t.relation("sender"),
  }),
});

// ── Mutations ────────────────────────────────────────────────────────────────

builder.mutationField("sendMessage", (t) =>
  t.prismaField({
    type: "Message",
    authScopes: { authenticated: true },
    args: {
      jobId: t.arg.id({ required: true }),
      content: t.arg({ type: "NonEmptyString", required: true }),
    },
    resolve: (query, _, args, ctx) =>
      ctx.services.message.send(args.jobId, args.content, requireCurrentUser(ctx), query),
  }),
);

// ── Subscriptions ────────────────────────────────────────────────────────────

builder.subscriptionField("messageSent", (t) =>
  t.field({
    type: MessageRef,
    authScopes: { authenticated: true },
    args: {
      jobId: t.arg.id({ required: true }),
    },
    subscribe: async (_root, args, ctx) => {
      // Verify the subscriber has access to this job (throws Forbidden/NotFound if not)
      await ctx.services.job.getJob(String(args.jobId), requireCurrentUser(ctx));
      return getPubSub().asyncIterator<Message>(TOPICS.MESSAGE_SENT(String(args.jobId)));
    },
    resolve: (event) => event as Message,
  }),
);
