import { createServer } from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@as-integrations/express5";
import type { Disposable } from "graphql-ws";
import { useServer } from "graphql-ws/use/ws";
import { buildSchema } from "./graphql/schema";
import { buildContext, buildWsContext } from "./context";
import { env } from "./config/env";
import { initializePubSub } from "./lib/pubsub";

async function main() {
  const schema = buildSchema();
  await initializePubSub();

  const app = express();
  const httpServer = createServer(app);

  const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });
  const wsCleanup: Disposable = useServer({ schema, context: buildWsContext }, wsServer);

  const server = new ApolloServer({
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

  await server.start();

  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => buildContext(req),
    }),
  );

  await new Promise<void>((resolve) => httpServer.listen({ port: env.PORT }, resolve));
  console.log(`Server ready at http://localhost:${env.PORT}/graphql`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
