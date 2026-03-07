import { Role, User } from "@prisma/client";
import { builder, UserRoleEnum } from "../../graphql/builder";
import { requireCurrentUser } from "../../context";
import { userRepository } from "./repository";

// ── Types ────────────────────────────────────────────────────────────────────

export const UserRef = builder.prismaObject("User", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    email: t.exposeString("email"),
    role: t.expose("role", { type: UserRoleEnum }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

const AuthPayloadRef = builder.objectRef<{ token: string; role: Role; user: User }>("AuthPayload");
AuthPayloadRef.implement({
  fields: (t) => ({
    token: t.exposeString("token"),
    role: t.expose("role", { type: UserRoleEnum }),
    user: t.expose("user", { type: UserRef }),
  }),
});

// ── Queries ──────────────────────────────────────────────────────────────────

builder.queryField("me", (t) =>
  t.prismaField({
    type: "User",
    authScopes: { authenticated: true },
    resolve: (query, _, __, ctx) =>
      userRepository.findById(requireCurrentUser(ctx).userId, undefined, query) as Promise<User>,
  }),
);

// ── Mutations ────────────────────────────────────────────────────────────────

builder.mutationField("login", (t) =>
  t.field({
    type: AuthPayloadRef,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    resolve: (_, args, ctx) => ctx.services.user.login(args.email, args.password),
  }),
);
