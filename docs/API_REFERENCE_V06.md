# AssetTrust v0.6 — New HTTP endpoints

All paths are prefixed `/api/v1`. Authenticated routes require a valid short-lived JWT in the `Authorization: Bearer ...` header and a non-revoked server-side session. Sensitive trust operations additionally require platform reviewer appointment and a TOTP validation in that same session within 15 minutes.

| Method | Path | Access | Behavior |
| --- | --- | --- | --- |
| GET | `/professional/me` | Any signed-in user | Personal professional applications and live accreditation status |
| POST | `/professional/applications` | Invited SURVEYOR / LEGAL_REVIEWER | Submit pending claim (does not approve account) |
| POST | `/professional/applications/:id/withdraw` | Original applicant | Withdraw pending claim only |
| GET | `/professional/review-queue` | Appointed platform reviewer + recent MFA | Restricted external applicant claims from other organizations |
| POST | `/professional/applications/:id/attest` | Appointed platform reviewer + recent MFA | VERIFIED/REJECTED decision with externally checked evidence |
| POST | `/professional/users/:id/revoke` | Appointed platform reviewer + recent MFA | Invalidate external-org professional accreditation with documented reason |
| POST | `/auth/mfa/step-up` | Authenticated user with enabled TOTP | Verify fresh non-replayed 6-digit code; session step-up lasts 15 minutes |

### Submit application JSON

```json
{
  "regulatorName": "Professional licensing body",
  "licenceReference": "LICENCE-123456",
  "jurisdiction": "Uganda",
  "licenceExpiresAt": "2027-12-31T23:59:00.000Z",
  "explanation": "Registration details and an independently checkable licence reference."
}
```

`supportingDocumentId` is optional and must match a document privately uploaded by this applicant in the same organization. It does not grant unrelated platform staff permission to view that document.

### Attest JSON

```json
{
  "decision": "VERIFIED",
  "verificationMethod": "Direct check with the appropriate professional registry",
  "verificationReference": "REGISTRY-SEARCH-2026-0123",
  "reviewerNotes": "Checked the claimed registration through an independent official channel and confirmed currently active status."
}
```

A first VERIFIED attestation returns `status: PENDING`. A second unique, eligible reviewer can change status to APPROVED. A REJECTED result closes the application immediately. All successful decisions are recorded in the applicant organization's local audit chain (not public blockchain).

### Out-of-band operations

Appointment/disable of platform trust reviewers is **CLI only**, using an approved infrastructure change ticket. No API route accepts an applicant's request to appoint themselves as a trust reviewer.
