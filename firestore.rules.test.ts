/**
 * Adversarial Security Rules Specification Tests (Dirty Dozen Matrix)
 * Models allowed owner operations vs. adversarial cross-tenant, schema-pollution,
 * backdated-timestamp, and oversized-payload attacks against DRAFT_firestore.rules.
 */

export interface MockRuleTestCase {
  name: string;
  actorUid: string | null;
  emailVerified: boolean;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  payload?: Record<string, unknown>;
  expectedAllow: boolean;
}

export const SECURITY_RULE_TEST_MATRIX: MockRuleTestCase[] = [
  {
    name: '1. Unauthenticated read on /users/u1 is DENIED',
    actorUid: null,
    emailVerified: false,
    path: '/users/u1',
    operation: 'get',
    expectedAllow: false,
  },
  {
    name: '2. Unverified email user creating /users/u1 is DENIED',
    actorUid: 'u1',
    emailVerified: false,
    path: '/users/u1',
    operation: 'create',
    expectedAllow: false,
  },
  {
    name: '3. Cross-tenant user u2 listing /users/u1/chats is DENIED',
    actorUid: 'u2',
    emailVerified: true,
    path: '/users/u1/chats',
    operation: 'list',
    expectedAllow: false,
  },
  {
    name: '4. Verified owner u1 creating valid ChatSession in /users/u1/chats/c1 is ALLOWED',
    actorUid: 'u1',
    emailVerified: true,
    path: '/users/u1/chats/c1',
    operation: 'create',
    payload: {
      ownerId: 'u1',
      title: 'Quantum Mechanics Overview',
      messageCount: 1,
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedAllow: true,
  },
  {
    name: '5. Schema pollution (extra isAdmin field) on /users/u1/chats/c1 is DENIED',
    actorUid: 'u1',
    emailVerified: true,
    path: '/users/u1/chats/c1',
    operation: 'create',
    payload: {
      ownerId: 'u1',
      title: 'Injected Role',
      messageCount: 0,
      isAdmin: true,
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedAllow: false,
  },
  {
    name: '6. Ownership hijacking (mutating ownerId on update) is DENIED',
    actorUid: 'u1',
    emailVerified: true,
    path: '/users/u1/chats/c1',
    operation: 'update',
    payload: {
      ownerId: 'u2',
      title: 'Hijacked',
      messageCount: 2,
      updatedAt: 'SERVER_TIMESTAMP',
    },
    expectedAllow: false,
  },
  {
    name: '7. Megabyte storage DoS (>25000 chars message text) is DENIED',
    actorUid: 'u1',
    emailVerified: true,
    path: '/users/u1/chats/c1/messages/m1',
    operation: 'create',
    payload: {
      chatId: 'c1',
      ownerId: 'u1',
      role: 'user',
      text: 'x'.repeat(25001),
      sourcesJson: '[]',
      isOfflineGenerated: false,
      clientOrder: 1,
      createdAt: 'SERVER_TIMESTAMP',
    },
    expectedAllow: false,
  },
  {
    name: '8. Undeclared root collection /adminSecrets/s1 is DENIED by default catch-all',
    actorUid: 'u1',
    emailVerified: true,
    path: '/adminSecrets/s1',
    operation: 'get',
    expectedAllow: false,
  },
];
