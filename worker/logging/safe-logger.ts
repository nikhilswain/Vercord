export interface SafeLogFields {
  correlationId: string;
  outcome: string;
  durationMs: number;
  categoryCount?: number;
  channelCount?: number;
}

export interface SafeLogger {
  info(event: 'discord_sync_complete', fields: SafeLogFields): void;
  error(event: 'discord_sync_failed', fields: SafeLogFields): void;
}

function serializeSafeFields(fields: SafeLogFields): string {
  return JSON.stringify({
    correlationId: fields.correlationId,
    outcome: fields.outcome,
    durationMs: fields.durationMs,
    ...(typeof fields.categoryCount === 'number' ? { categoryCount: fields.categoryCount } : {}),
    ...(typeof fields.channelCount === 'number' ? { channelCount: fields.channelCount } : {}),
  });
}

export function createConsoleSafeLogger(): SafeLogger {
  return {
    info(event, fields) {
      console.info(event, serializeSafeFields(fields));
    },
    error(event, fields) {
      console.error(event, serializeSafeFields(fields));
    },
  };
}
