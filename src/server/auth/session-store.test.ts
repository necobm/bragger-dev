import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/index.js';
import { SESSION_TTL_MS, SessionStore } from './session-store.js';

describe('SessionStore', () => {
  const setup = () => {
    const db = openDatabase(':memory:');
    let now = 1_000_000;
    const clock = { now: () => now, advance: (ms: number) => (now += ms) };
    return { db, clock, store: new SessionStore(db, 'os-session-a', clock.now) };
  };

  it('validates a fresh session', () => {
    const { store } = setup();
    const { token } = store.create();
    expect(store.validate(token)).not.toBeNull();
    expect(store.validate('bogus')).toBeNull();
  });

  it('expires sessions after 10 days', () => {
    const { store, clock } = setup();
    const { token } = store.create();
    clock.advance(SESSION_TTL_MS - 1);
    expect(store.validate(token)).not.toBeNull();
    clock.advance(1);
    expect(store.validate(token)).toBeNull();
  });

  it('rejects sessions created in another OS login session', () => {
    const { db, store, clock } = setup();
    const { token } = store.create();
    const afterRelogin = new SessionStore(db, 'os-session-b', clock.now);
    expect(afterRelogin.validate(token)).toBeNull();
    expect(afterRelogin.purgeStale()).toBe(1);
  });

  it('revokes sessions', () => {
    const { store } = setup();
    const { token } = store.create();
    store.revoke(token);
    expect(store.validate(token)).toBeNull();
  });
});
