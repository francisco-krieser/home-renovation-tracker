import { Kind, GraphQLScalarType } from "graphql";
import { Decimal } from "@prisma/client/runtime/library";

// Bridges Prisma's Decimal type to a precision-safe string representation.
// serialize: Decimal → string (output to client)
// parseValue: string | number → Decimal (from JSON variables)
// parseLiteral: string | number literal → Decimal (from inline query values)
export const DecimalScalar = new GraphQLScalarType<Decimal, string>({
  name: "Decimal",
  serialize: (value) => {
    if (value instanceof Decimal) return value.toFixed();
    if (typeof value === "string" || typeof value === "number") return new Decimal(value).toFixed();
    throw new Error(`Decimal cannot serialize value: ${String(value)}`);
  },
  parseValue: (value) => {
    if (typeof value === "string" || typeof value === "number") return new Decimal(value);
    throw new Error("Decimal input must be a string or number");
  },
  parseLiteral: (ast) => {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
      return new Decimal(ast.value);
    }
    throw new Error("Decimal literal must be a string, int, or float");
  },
});
