import { GraphQLError } from "graphql";

export class UnauthorizedError extends GraphQLError {
  constructor(message = "Unauthorized") {
    super(message, { extensions: { code: "UNAUTHENTICATED" } });
  }
}

export class ForbiddenError extends GraphQLError {
  constructor(message = "Forbidden") {
    super(message, { extensions: { code: "FORBIDDEN" } });
  }
}

export class NotFoundError extends GraphQLError {
  constructor(message = "Not found") {
    super(message, { extensions: { code: "NOT_FOUND" } });
  }
}

export class BadRequestError extends GraphQLError {
  constructor(message: string) {
    super(message, { extensions: { code: "BAD_REQUEST" } });
  }
}
