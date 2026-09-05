import { createD1AuthRepository, type SessionRecord } from '../auth/repository';

export type WorldActor = { guildId: string; userId: string; sessionHash: string };

export function sessionBindingIsCurrent(
  session: Pick<SessionRecord, 'userId' | 'sessionExpiresAt'> | null,
  actor: WorldActor,
  now: number,
): boolean {
  return (
    session !== null &&
    session.userId === actor.userId &&
    session.sessionExpiresAt > Math.floor(now / 1_000)
  );
}

export async function sessionIsCurrent(env: Env, actor: WorldActor, now: number): Promise<boolean> {
  const session = await createD1AuthRepository(env.AUTH_DB).readSession(actor.sessionHash);
  return sessionBindingIsCurrent(session, actor, now);
}
