import { describe, expect, it } from 'vitest';

import { createIdentifierFactory } from '../../../../src/domain/discord/identifiers';
import { decodeBase64UrlSecret } from '../../../../worker/config/runtime';
import { TEST_IDS } from '../../../fixtures/discord/guild-source';

const SECRET = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI';

describe('private Discord identifier factory', () => {
  it('matches the fixed full-length HMAC-SHA-256 vector', async () => {
    const factory = await createIdentifierFactory(decodeBase64UrlSecret(SECRET));

    await expect(factory.for('guild', TEST_IDS.guild)).resolves.toBe(
      'g_wJ5i9YBj9DFNjZOX3VA8WBjJloEkuU5aSPJcjCv4qpc',
    );
  });

  it('uses all four prefixes and the complete unpadded 32-byte digest', async () => {
    const factory = await createIdentifierFactory(decodeBase64UrlSecret(SECRET));
    const identifiers = await Promise.all([
      factory.for('guild', TEST_IDS.guild),
      factory.for('channel', TEST_IDS.publicText),
      factory.for('role', TEST_IDS.botRole),
      factory.for('member', TEST_IDS.owner),
    ]);

    expect(identifiers).toEqual([
      expect.stringMatching(/^g_[A-Za-z0-9_-]{43}$/),
      expect.stringMatching(/^c_[A-Za-z0-9_-]{43}$/),
      expect.stringMatching(/^r_[A-Za-z0-9_-]{43}$/),
      expect.stringMatching(/^m_[A-Za-z0-9_-]{43}$/),
    ]);
    for (const identifier of identifiers) {
      expect(identifier).not.toContain('=');
      expect(identifier).toHaveLength(45);
    }
  });

  it('domain-separates the same snowflake by identifier kind', async () => {
    const factory = await createIdentifierFactory(decodeBase64UrlSecret(SECRET));
    const guild = await factory.for('guild', TEST_IDS.guild);
    const role = await factory.for('role', TEST_IDS.guild);
    const channel = await factory.for('channel', TEST_IDS.guild);
    const member = await factory.for('member', TEST_IDS.guild);

    expect(role).not.toBe(guild);
    expect(new Set([guild.slice(2), role.slice(2), channel.slice(2), member.slice(2)]).size).toBe(
      4,
    );
  });

  it('returns the same cached promise and value for repeated kind-snowflake calls', async () => {
    const factory = await createIdentifierFactory(decodeBase64UrlSecret(SECRET));
    const first = factory.for('channel', TEST_IDS.publicText);
    const second = factory.for('channel', TEST_IDS.publicText);

    expect(second).toBe(first);
    await expect(second).resolves.toBe(await first);
    expect(factory.for('channel', TEST_IDS.hiddenText)).not.toBe(first);
    expect(factory.for('role', TEST_IDS.publicText)).not.toBe(first);
  });

  it('never includes any input snowflake in emitted identifiers', async () => {
    const factory = await createIdentifierFactory(decodeBase64UrlSecret(SECRET));
    const inputs = [TEST_IDS.guild, TEST_IDS.publicText, TEST_IDS.botRole, TEST_IDS.owner] as const;
    const kinds = ['guild', 'channel', 'role', 'member'] as const;

    for (let index = 0; index < kinds.length; index += 1) {
      const identifier = await factory.for(kinds[index]!, inputs[index]!);
      for (const snowflake of inputs) expect(identifier).not.toContain(snowflake);
    }
  });
});
