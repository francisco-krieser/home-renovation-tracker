import { ApolloServer } from "@apollo/server";
import type { IncomingMessage } from "http";
import { buildSchema } from "../../graphql/schema";
import { buildContext } from "../../context";

export interface GqlError {
  message: string;
  extensions?: { code?: string; [key: string]: unknown };
}

export interface GqlResult<T = Record<string, any>> {
  data: T;
  errors?: GqlError[];
}

// Lazily created once; shared across all tests in the same worker process.
let server: ApolloServer | null = null;

async function getServer(): Promise<ApolloServer> {
  if (!server) {
    const schema = buildSchema();
    server = new ApolloServer({ schema });
    await server.start();
  }
  return server;
}

/**
 * Execute a GraphQL operation against the real Apollo Server.
 * Pass `token` to send an Authorization: Bearer header (building context via JWT).
 */
export async function gql<T = Record<string, any>>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string,
): Promise<GqlResult<T>> {
  const s = await getServer();

  const mockReq = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as IncomingMessage;

  const contextValue = await buildContext(mockReq);

  const response = await s.executeOperation({ query, variables }, { contextValue });

  if (response.body.kind !== "single") {
    throw new Error("Unexpected incremental delivery response in test");
  }

  return response.body.singleResult as GqlResult<T>;
}
