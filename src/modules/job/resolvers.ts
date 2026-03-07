import { builder, JobStatusEnum } from "../../graphql/builder";
import { requireCurrentUser } from "../../context";

// ── Input types ──────────────────────────────────────────────────────────────

const CreateJobInput = builder.inputType("CreateJobInput", {
  fields: (t) => ({
    description: t.field({ type: "NonEmptyString", required: true }),
    address: t.field({ type: "NonEmptyString", required: true }),
    cost: t.field({ type: "Decimal", required: true }),
  }),
});

const UpdateJobInput = builder.inputType("UpdateJobInput", {
  fields: (t) => ({
    description: t.field({ type: "NonEmptyString", required: false }),
    address: t.field({ type: "NonEmptyString", required: false }),
    status: t.field({ type: JobStatusEnum, required: false }),
    cost: t.field({ type: "Decimal", required: false }),
  }),
});

const AddHomeownerInput = builder.inputType("AddHomeownerInput", {
  fields: (t) => ({
    name: t.field({ type: "NonEmptyString", required: true }),
    email: t.field({ type: "EmailAddress", required: true }),
  }),
});

// ── Types ────────────────────────────────────────────────────────────────────

builder.prismaObject("Job", {
  fields: (t) => ({
    id: t.exposeID("id"),
    description: t.exposeString("description", { authScopes: { contractor: true } }),
    address: t.exposeString("address", { authScopes: { contractor: true } }),
    status: t.expose("status", { type: JobStatusEnum }),
    cost: t.expose("cost", { type: "Decimal", authScopes: { contractor: true } }),
    createdAt: t.expose("createdAt", { type: "DateTime", authScopes: { contractor: true } }),
    updatedAt: t.expose("updatedAt", { type: "DateTime", authScopes: { contractor: true } }),
    contractor: t.relation("contractor", {
      authScopes: { contractor: true },
    }),
    homeowner: t.relation("homeowner", {
      nullable: true,
      authScopes: { contractor: true },
    }),
    messages: t.relation("messages", {
      query: () => ({ orderBy: { createdAt: "asc" } }),
    }),
  }),
});

// ── Queries ──────────────────────────────────────────────────────────────────

builder.queryField("jobs", (t) =>
  t.prismaField({
    type: ["Job"],
    authScopes: { contractor: true },
    resolve: (query, _, __, ctx) =>
      ctx.services.job.listContractorJobs(requireCurrentUser(ctx), query),
  }),
);

builder.queryField("job", (t) =>
  t.prismaField({
    type: "Job",
    nullable: true,
    authScopes: { authenticated: true },
    args: { id: t.arg.id({ required: true }) },
    resolve: (query, _, args, ctx) =>
      ctx.services.job.getJob(args.id, requireCurrentUser(ctx), query),
  }),
);

// ── Mutations ────────────────────────────────────────────────────────────────

builder.mutationField("createJob", (t) =>
  t.prismaField({
    type: "Job",
    authScopes: { contractor: true },
    args: { input: t.arg({ type: CreateJobInput, required: true }) },
    resolve: (query, _, args, ctx) =>
      ctx.services.job.create(args.input, requireCurrentUser(ctx), query),
  }),
);

builder.mutationField("updateJob", (t) =>
  t.prismaField({
    type: "Job",
    nullable: true,
    authScopes: { contractor: true },
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateJobInput, required: true }),
    },
    resolve: (query, _, args, ctx) =>
      ctx.services.job.update(args.id, args.input, requireCurrentUser(ctx), query),
  }),
);

builder.mutationField("deleteJob", (t) =>
  t.field({
    type: "Boolean",
    authScopes: { contractor: true },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_, args, ctx) => ctx.services.job.softDelete(args.id, requireCurrentUser(ctx)),
  }),
);

builder.mutationField("addHomeowner", (t) =>
  t.prismaField({
    type: "Job",
    authScopes: { contractor: true },
    args: {
      jobId: t.arg.id({ required: true }),
      input: t.arg({ type: AddHomeownerInput, required: true }),
    },
    resolve: (query, _, args, ctx) =>
      ctx.services.job.addHomeowner(args.jobId, args.input, requireCurrentUser(ctx), query),
  }),
);
