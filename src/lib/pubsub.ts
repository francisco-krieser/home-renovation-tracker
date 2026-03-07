import { RedisPubSub } from "graphql-redis-subscriptions";
import Redis from "ioredis";
import { env } from "../config/env";

const redisOptions =
  process.env.NODE_ENV === "test"
    ? { lazyConnect: true, enableOfflineQueue: true, maxRetriesPerRequest: 0 }
    : { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 };

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let pubsubInstance: RedisPubSub | null = null;
const redisUrl = String(env.REDIS_URL);

function ensurePubSub(): RedisPubSub {
  if (!publisher) publisher = new Redis(redisUrl, redisOptions);
  if (!subscriber) subscriber = new Redis(redisUrl, redisOptions);
  if (!pubsubInstance) pubsubInstance = new RedisPubSub({ publisher, subscriber });
  return pubsubInstance;
}

export function getPubSub(): RedisPubSub {
  return ensurePubSub();
}

async function connectClient(client: Redis): Promise<void> {
  if (client.status === "ready") return;
  if (
    client.status === "connecting" ||
    client.status === "reconnecting" ||
    client.status === "connect"
  ) {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        client.off("ready", onReady);
        client.off("error", onError);
      };
      client.on("ready", onReady);
      client.on("error", onError);
    });
    return;
  }

  await client.connect();
}

/** Ensure pub/sub Redis clients are writable before first publish/subscribe command. */
export async function initializePubSub(): Promise<void> {
  ensurePubSub();
  await Promise.all([connectClient(publisher!), connectClient(subscriber!)]);
}

/** Disconnect both Redis clients — call in test teardown to unblock Jest from exiting. */
export function closePubSub(): void {
  publisher?.disconnect();
  subscriber?.disconnect();
  publisher = null;
  subscriber = null;
  pubsubInstance = null;
}

export const TOPICS = {
  MESSAGE_SENT: (jobId: string) => `MESSAGE_SENT.${jobId}`,
} as const;
