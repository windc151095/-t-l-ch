# Security Specification - Schedlr Admin Panel

## 1. Data Invariants
- An appointment cannot exist without a client name, guide, question, and valid date/time.
- Only an Admin or a user with the correct PIN can cancel an appointment.
- Global settings and day configurations can only be modified by an Admin or with the master password ('123456').
- Custom Day Configurations must be tied to a valid date string (YYYY-MM-DD).

## 2. The "Dirty Dozen" Payloads (Attack Vectors)

| ID | Attack Name | Target Path | Payload / Action | Expected Result |
|----|-------------|-------------|------------------|-----------------|
| 1 | Identity Spoofing | `/appointments/{id}` | Create with `clientName: "Admin"` but someone else's ID | DENIED |
| 2 | Shadow Field Injection | `/appointments/{id}` | Update with `status: "active", adminVerified: true` | DENIED |
| 3 | State Shortcutting | `/appointments/{id}` | Update `status` from `active` to `cancelled` without PIN | DENIED |
| 4 | Resource Poisoning | `/appointments/{junk_id}` | Create with 1MB string as ID | DENIED |
| 5 | Temporal Fraud | `/appointments/{id}` | Create with `createdAt` as a past timestamp | DENIED |
| 6 | Privilege Escalation | `/admins/{uid}` | Create own admin record | DENIED |
| 7 | Settings Hijack | `/settings/global` | Update without password '123456' | DENIED |
| 8 | Orphaned Write | `/dayConfigs/invalid-date` | Create with malformed date ID | DENIED |
| 9 | Mass Read Scraping | `/appointments` | List all appointments to find passwords | DENIED (if PII isolation applied) |
| 10 | Denial of Wallet | `/appointments` | Create appointment with 100kb question | DENIED (via size limits) |
| 11 | ID Poisoning | `/lockedSlots/../../../` | Path traversal in slot ID | DENIED |
| 12 | Outcome Locking Bypass | `/appointments/{id}` | Re-activate a cancelled appointment as a guest | DENIED |

## 3. Test Runner Design
The tests will be implemented in `firestore.rules.test.ts` (if applicable) or conceptually verified. We will ensure that:
- Guest can read settings and available slots.
- Guest can create an appointment if schema is valid.
- Guest CANNOT update other's appointments.
- Guest CANNOT delete appointments without PIN or Admin role.
- Admin (verified email "congnguyen151095@gmail.com") has full access.
