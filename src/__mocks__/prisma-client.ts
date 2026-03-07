// Manual mock for @prisma/client — keeps unit tests free of the real Prisma runtime

export enum Role {
  CONTRACTOR = "CONTRACTOR",
  HOMEOWNER = "HOMEOWNER",
}

export enum JobStatus {
  PLANNING = "PLANNING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELED = "CANCELED",
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Prisma {
  export class PrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    meta?: Record<string, unknown>;

    constructor(message: string, { code, clientVersion }: { code: string; clientVersion: string }) {
      super(message);
      this.name = "PrismaClientKnownRequestError";
      this.code = code;
      this.clientVersion = clientVersion;
    }
  }
}

// Minimal PrismaClient stub — actual DB calls are always mocked at repository level
export class PrismaClient {
  $extends(_args?: unknown) {
    return this;
  }
  $transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(this));
}
