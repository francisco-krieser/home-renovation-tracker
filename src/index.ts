import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { buildSchema } from "./graphql/schema";
import { buildContext } from "./context";
import { env } from "./config/env";

async function main() {
  const schema = buildSchema();

  const server = new ApolloServer({ schema });

  const { url } = await startStandaloneServer(server, {
    listen: { port: env.PORT },
    context: async ({ req }) => buildContext(req),
  });

  console.log(`Server ready at ${url}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
