# Security Spec for PROMT & SUPPORT Hub

## Data Invariants
1. All documents must have a `createdAt` timestamp set by the server.
2. Only authenticated users with verified emails can read/write data.
3. Every write must include all required fields for that entity.
4. Document IDs must be standard alphanumeric strings.

## The Dirty Dozen Payloads (Targeting Rejection)

1. **Anonymous Write**: Attempting to create an account while not signed in.
2. **Unverified Email**: Attempting to write with `email_verified: false`.
3. **Shadow Update**: Adding a field `isAdmin: true` to an Account document.
4. **Identity Spoofing**: Setting `creatorId` to another user's UID.
5. **ID Poisoning**: Using a 2KB string as a document ID.
6. **Zero-Byte Name**: Creating a Task with an empty `title` string.
7. **Type Mismatch**: Sending a number for the Account `login` field.
8. **Massive Payload**: Sending a 2MB note field (Standard Firestore limit is 1MB, but we should cap strings).
9. **Timeline Skip**: Updating a task status from 'todo' to 'completed' while bypassing server timestamps.
10. **Malicious Link**: Injecting javascript into the `serviceUrl` field.
11. **Orphaned Message**: Creating a message without a `senderId` that matches the auth user.
12. **System Field Injection**: Manually setting `createdAt` to a past date.

## Test Runner (Logic Check)
The `firestore.rules` will implement `isValidId()`, `isValidAccount()`, `isValidTask()`, etc., to ensure these payloads fail.
