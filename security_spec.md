# Firestore Security Specification (`security_spec.md`)

## 1. Access Control & Data Isolation Model
- **Default Deny**: `match /{document=**} { allow read, write: if false; }` blocks all undeclared paths.
- **Verified Google Identity**: Every operation requires `request.auth != null` and `request.auth.token.email_verified == true`.
- **Strict Tenant Isolation**:
  - `/users/{userId}`: Accessible exclusively when `request.auth.uid == userId` and `isValidId(userId)`. Protects PII (`email`, `displayName`, `photoURL`) from enumeration or cross-tenant reads.
  - `/users/{userId}/chats/{chatId}`: Accessible exclusively when `request.auth.uid == userId`, `isValidId(chatId)`, and `ownerId == request.auth.uid`.
  - `/users/{userId}/chats/{chatId}/messages/{messageId}`: Accessible exclusively when `request.auth.uid == userId`, `isValidId(messageId)`, `ownerId == request.auth.uid`, `chatId == chatId`, and on creation the parent `/users/{userId}/chats/{chatId}` document exists and is owned by `request.auth.uid`.

## 2. Data Invariants per Collection

### `/users/{userId}` (`UserProfile`)
- Exact keys: `['uid', 'email', 'displayName', 'photoURL', 'createdAt', 'updatedAt']` (`hasAll` + `hasOnly`).
- `uid`: `string`, `uid == userId`, `uid == request.auth.uid`, immutable on update.
- `email`: `string`, `size() >= 3 && size() <= 254`, matches basic email regex.
- `displayName`: `string`, `size() >= 1 && size() <= 100`.
- `photoURL`: `string`, `size() >= 0 && size() <= 1000`.
- `createdAt`: `timestamp`, `== request.time` on create, immutable on update.
- `updatedAt`: `timestamp`, `== request.time` on create and update (`>= resource.data.updatedAt`).
- Allowed update keys (`affectedKeys().hasOnly`): `['email', 'displayName', 'photoURL', 'updatedAt']`.
- Delete: `false` (user profile records are retained to anchor chat hierarchy).

### `/users/{userId}/chats/{chatId}` (`ChatSession`)
- Exact keys: `['ownerId', 'title', 'messageCount', 'createdAt', 'updatedAt']` (`hasAll` + `hasOnly`).
- `ownerId`: `string`, `== userId` and `== request.auth.uid`, immutable on update.
- `title`: `string`, `size() >= 1 && size() <= 160`.
- `messageCount`: `int`, `>= 0 && <= 5000`.
- `createdAt`: `timestamp`, `== request.time` on create, immutable on update.
- `updatedAt`: `timestamp`, `== request.time` on create and update.
- Allowed update Actions:
  - Rename / bump metadata: `affectedKeys().hasOnly(['title', 'messageCount', 'updatedAt'])`.
- Delete: Allowed only for verified owner (`isOwner(userId) && resource.data.ownerId == request.auth.uid`).

### `/users/{userId}/chats/{chatId}/messages/{messageId}` (`ChatMessageDoc`)
- Exact keys: `['chatId', 'ownerId', 'role', 'text', 'sourcesJson', 'isOfflineGenerated', 'clientOrder', 'createdAt']` (`hasAll` + `hasOnly`).
- `chatId`: `string`, `== chatId`, immutable.
- `ownerId`: `string`, `== userId` and `== request.auth.uid`, immutable.
- `role`: `string`, `in ['user', 'model']`, immutable.
- `text`: `string`, `size() >= 1 && size() <= 25000`.
- `sourcesJson`: `string`, `size() >= 2 && size() <= 8000`.
- `isOfflineGenerated`: `bool`.
- `clientOrder`: `int`, `>= 0 && <= 99999999999999`.
- `createdAt`: `timestamp`, `== request.time` on create, immutable.
- Master Gate on Create: Parent `/users/$(userId)/chats/$(chatId)` must `exists()` and have `ownerId == request.auth.uid`.
- Update: Allowed only for updating streamed/completed model text & sources (`affectedKeys().hasOnly(['text', 'sourcesJson', 'isOfflineGenerated'])`) by verified owner while keeping `ownerId`, `chatId`, `role`, `clientOrder`, and `createdAt` strictly immutable.
- Delete: Allowed only for verified owner (`isOwner(userId) && resource.data.ownerId == request.auth.uid`).

## 3. Dirty Dozen Attack Vectors Addressed
1. Unauthenticated read/write -> Blocked by `isVerifiedUser()`.
2. Unverified email spoof -> Blocked by `request.auth.token.email_verified == true`.
3. Cross-user chat history read (`userA` reading `/users/userB/chats`) -> Blocked by `request.auth.uid == userId` AND `resource.data.ownerId == request.auth.uid`.
4. Path traversal / malformed IDs -> Blocked by `isValidId()` (`^[a-zA-Z0-9_-]{1,128}$`).
5. Extra undocumented fields (`isAdmin: true`) -> Blocked by `keys().hasOnly(...)`.
6. Missing required fields -> Blocked by `keys().hasAll(...)`.
7. Megabyte payload storage DoS -> Blocked by `.size()` bounds on every string (`title <= 160`, `text <= 25000`, `sourcesJson <= 8000`).
8. Backdated/forged `createdAt` or `updatedAt` -> Blocked by `== request.time`.
9. Ownership hijacking (`ownerId` mutation on update) -> Blocked by `affectedKeys().hasOnly(...)` excluding `ownerId` and explicit equality check `request.resource.data.ownerId == resource.data.ownerId`.
10. Orphaned subcollection message injection -> Blocked by `exists()` + `get()` parent `ChatSession` check on message `create`.
11. `allow list` N+1 / filter bypass -> `allow get` and `allow list` separated; `allow list` checks `isOwner(userId) && resource.data.ownerId == request.auth.uid` with zero `get()`/`exists()` calls.
12. `null` / `NaN` math crash -> Type checks (`is int`, `is string`, `is bool`, `is timestamp`) precede all comparisons.
