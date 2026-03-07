import { createServer } from "http";
import type { AddressInfo } from "net";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import type { Disposable } from "graphql-ws";
import { useServer } from "graphql-ws/use/ws";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import { buildSchema } from "../../graphql/schema";
import { buildContext, buildWsContext } from "../../context";

export interface TestServer {
  /** WebSocket URL, e.g. ws://localhost:54321/graphql */
  wsUrl: string;
  /** HTTP URL, e.g. http://localhost:54321/graphql */
  httpUrl: string;
  stop: () => Promise<void>;
}

/**
 * Start a full Express + WebSocket Apollo server on an OS-assigned ephemeral port (port 0).
 * Use this in subscription integration tests where server.executeOperation() is insufficient.
 *
 * Shares the `pubsub` singleton with the in-process gql() helper (same Jest worker process),
 * so mutations fired via gql() publish through the same Redis connections the WS server subscribes on.
 */
export async function startTestServer(): Promise<TestServer> {
  const schema = buildSchema();
  const app = express();
  const httpServer = createServer(app);

  const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });
  const wsCleanup: Disposable = useServer({ schema, context: buildWsContext }, wsServer);

  const apolloServer = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        serverWillStart() {
          return Promise.resolve({
            async drainServer() {
              await wsCleanup.dispose();
            },
          });
        },
      },
    ],
  });

  await apolloServer.start();

  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }) => buildContext(req),
    }),
  );

  // Port 0: OS assigns a random free port — avoids collisions in parallel test runs
  await new Promise<void>((resolve) => httpServer.listen({ port: 0 }, resolve));

  const { port } = httpServer.address() as AddressInfo;

  return {
    httpUrl: `http://localhost:${port}/graphql`,
    wsUrl: `ws://localhost:${port}/graphql`,
    stop: async () => {
      await apolloServer.stop().catch((err: unknown) => {
        if (err instanceof Error && err.message === "Server is not running.") {
          return;
        }
        throw err;
      });
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => {
          if (!err) {
            resolve();
            return;
          }
          if (err.message === "Server is not running.") {
            resolve();
            return;
          }
          reject(err);
        }),
      );
    },
  };
}
