import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string({ required_error: "DATABASE_URL is required" }),
  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = envSchema.parse(process.env);

export const JWT_EXPIRY = "7d";
