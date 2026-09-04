import { z } from 'zod';

const secretSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/u)
  .refine((value) => !value.startsWith('enter-') && !value.startsWith('generate-'));

const configSchema = z
  .strictObject({
    DISCORD_BOT_TOKEN: z
      .string()
      .min(20)
      .max(512)
      .regex(/^\S+$/u)
      .refine((value) => !value.startsWith('enter-') && !value.startsWith('generate-')),
    DMAP_BRIDGE_URL: z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'wss:' ||
        (url.protocol === 'ws:' && new Set(['localhost', '127.0.0.1', '[::1]']).has(url.hostname))
      );
    }),
    GATEWAY_BRIDGE_SECRET: secretSchema,
    SNAPSHOT_ID_SECRET: secretSchema,
  })
  .refine((value) => value.GATEWAY_BRIDGE_SECRET !== value.SNAPSHOT_ID_SECRET);

export interface GatewayConfig {
  botToken: string;
  bridgeUrl: string;
  bridgeSecret: string;
  snapshotIdSecret: Uint8Array;
}

function decodeSecret(value: string): Uint8Array {
  return Buffer.from(value, 'base64url');
}

export function parseGatewayConfig(values: NodeJS.ProcessEnv): GatewayConfig {
  const parsed = configSchema.safeParse({
    DISCORD_BOT_TOKEN: values.DISCORD_BOT_TOKEN,
    DMAP_BRIDGE_URL: values.DMAP_BRIDGE_URL,
    GATEWAY_BRIDGE_SECRET: values.GATEWAY_BRIDGE_SECRET,
    SNAPSHOT_ID_SECRET: values.SNAPSHOT_ID_SECRET,
  });
  if (!parsed.success) throw new Error('GATEWAY_CONFIG_INVALID');
  const snapshotIdSecret = decodeSecret(parsed.data.SNAPSHOT_ID_SECRET);
  if (snapshotIdSecret.byteLength !== 32) throw new Error('GATEWAY_CONFIG_INVALID');
  return {
    botToken: parsed.data.DISCORD_BOT_TOKEN,
    bridgeUrl: parsed.data.DMAP_BRIDGE_URL,
    bridgeSecret: parsed.data.GATEWAY_BRIDGE_SECRET,
    snapshotIdSecret,
  };
}
