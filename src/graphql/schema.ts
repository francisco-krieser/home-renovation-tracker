import { builder } from "./builder";

// Import order matters: job depends on UserRef (user) and MessageRef (message)
import "../modules/user/resolvers";
import "../modules/message/resolvers";
import "../modules/job/resolvers";

export function buildSchema() {
  return builder.toSchema();
}
