import { builder } from "../../graphql/builder";
import { requireCurrentUser } from "../../context";

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
