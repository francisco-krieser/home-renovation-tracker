import SchemaBuilder from "@pothos/core";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import PrismaPlugin from "@pothos/plugin-prisma";
import type PrismaTypes from "@pothos/plugin-prisma/generated";
import { getDatamodel } from "@pothos/plugin-prisma/generated";
import { Decimal } from "@prisma/client/runtime/library";
import { Role } from "@prisma/client";
import { GraphQLDateTime, GraphQLEmailAddress, GraphQLNonEmptyString } from "graphql-scalars";
import { basePrisma } from "../lib/prisma";
import { Context } from "../context";
import { ForbiddenError, UnauthorizedError } from "../errors/appErrors";
import { DecimalScalar } from "./scalars";

export const builder = new SchemaBuilder<{
  Context: Context;
  PrismaTypes: PrismaTypes;
  AuthScopes: {
    authenticated: boolean;
    contractor: boolean;
  };
  Scalars: {
    ID: { Input: string; Output: string | number };
    DateTime: { Input: Date; Output: Date };
    Decimal: { Input: Decimal; Output: Decimal };
    NonEmptyString: { Input: string; Output: string };
    EmailAddress: { Input: string; Output: string };
  };
}>({
  plugins: [ScopeAuthPlugin, PrismaPlugin],
  scopeAuth: {
    authScopes: (ctx) => ({
      authenticated: !!ctx.currentUser,
      contractor: ctx.currentUser?.role === Role.CONTRACTOR,
    }),
    unauthorizedError: (_, ctx) =>
      ctx.currentUser ? new ForbiddenError() : new UnauthorizedError(),
  },
  prisma: { client: basePrisma, dmmf: getDatamodel() },
});

builder.addScalarType("DateTime", GraphQLDateTime, {});
builder.addScalarType("Decimal", DecimalScalar, {});
builder.addScalarType("NonEmptyString", GraphQLNonEmptyString, {});
builder.addScalarType("EmailAddress", GraphQLEmailAddress, {});

export const JobStatusEnum = builder.enumType("JobStatus", {
  values: ["PLANNING", "IN_PROGRESS", "COMPLETED", "CANCELED"] as const,
});

export const UserRoleEnum = builder.enumType("UserRole", {
  values: ["CONTRACTOR", "HOMEOWNER"] as const,
});

// Root types must be declared before any module registers fields on them
builder.queryType({});
builder.mutationType({});
builder.subscriptionType({});
