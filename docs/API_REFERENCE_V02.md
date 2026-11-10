# AssetTrust API — developer route index v0.2

Base path: `/api/v1`; JSON unless a multipart upload is specified. Authenticate using `Authorization: Bearer <accessToken>` except the registration/login/invite-accept routes and `/healthz`. A successful response is not a claim of official ownership verification.

| Method | Route | Access / purpose |
|---|---|---|
| GET | `/healthz` | Public process health only (not DB readiness) |
| POST | `/auth/register` | Public; new organization/admin (Argon2id password) |
| POST | `/auth/login` | Public; receive time-limited bearer token |
| GET | `/auth/me` | Authenticated identity and role |
| POST | `/team/accept` | Public; consume an invitation token; 12+ character password |
| GET | `/team/members` | Org admin; members and accreditation flags |
| GET | `/team/invitations` | Org admin; invitation metadata, never token hash |
| POST | `/team/invitations` | Org admin; one-time 48-hour invite token, roles restricted |
| GET | `/assets` | Accessible assets only; optional `search`, `type` |
| POST | `/assets` | Authorized member; new declared asset |
| GET | `/assets/:id` | Record-scoped asset read |
| GET | `/cases` | Accessible cases only |
| POST | `/cases` | Create a case linked to accessible asset |
| GET | `/cases/:id` | Record-scoped case read |
| GET | `/cases/:id/evidence` | Read case evidence with case access |
| POST | `/cases/:id/evidence` | Current-stage sourced evidence; authorized reviewer |
| POST | `/cases/:id/advance` | Requires stage evidence, role, no open dispute |
| POST | `/cases/:id/assign` | Org admin assigns another same-org member; sends notification |
| GET | `/documents` | Accessible documents, metadata only |
| POST | `/documents/upload` | Multipart `file`, `assetId` and/or `caseId`; 5MB, PDF/PNG/JPEG/WebP |
| GET | `/documents/:id/file` | Authenticated download, SHA-256 recheck |
| GET | `/dashboard` | Scoped summary statistics and recent cases |
| GET | `/reports/case/:id` | Non-official evidence summary JSON |
| GET | `/billing/plans` | Informational illustrative catalogue; no charging |
| GET | `/audit` | Org admin; 100 latest local events |
| GET | `/audit/verify` | Org admin; recalculates local audit chain |
| GET | `/access/assets/:id/grants` | Org admin; authorized members on this asset |
| POST | `/access/assets/:id/grants` | Org admin; add/replace a time-limited grant |
| DELETE | `/access/grants/:id` | Org admin; revoke asset access grant |
| GET | `/operations/tasks` | Visible case tasks |
| GET | `/operations/cases/:id/tasks` | Per-case authorized tasks |
| POST | `/operations/tasks` | Add a case task |
| PATCH | `/operations/tasks/:id` | Assigned/creating user or admin updates task status |
| GET | `/operations/disputes` | Visible concerns |
| POST | `/operations/disputes` | Raise a case concern; blocks case |
| PATCH | `/operations/disputes/:id` | Admin resolves/investigates with text reasoning |
| GET | `/operations/reminders` | Visible manual reminders |
| POST | `/operations/reminders` | Store future review reminder |
| GET | `/operations/quotes` | Admin/reviewer; quote list |
| POST | `/operations/quotes` | Admin; create draft UGX quote |
| PATCH | `/operations/quotes/:id` | Admin; update quote lifecycle |
| GET | `/notifications` | Recipient's in-app notifications |
| PATCH | `/notifications/:id/read` | Recipient marks one notification read |
| GET | `/integrations/status` | Admin; shows disabled/required connections explicitly |
| GET | `/integrations/local-proof` | Admin; locally calculated audit commitment, NOT blockchain |

## Important request examples

```json
// POST /assets
{"assetType":"LAND","district":"Wakiso","declaredOwner":"Example claimant", "tenure":"Freehold", "parcelReference":"Block 101 Plot 50", "areaAcres":0.65}
```

```json
// POST /cases/:id/evidence
{"stage":"INTAKE","evidenceType":"IDENTITY", "sourceName":"Client-supplied identity record", "reference":"INT-002", "observations":"Identity file received. No government verification has been performed."}
```

```json
// POST /operations/disputes
{"caseId":"<UUID>","category":"BOUNDARY","description":"Two independently supplied plot diagrams describe different extents. Qualified surveying required."}
```

```json
// POST /operations/quotes
{"caseId":"<UUID>","amountUgx":125000,"scope":"Human review coordination and report assembly only. Registry, legal and survey charges are excluded."}
```

```json
// POST /access/assets/:id/grants
{"granteeId":"<member UUID>","permission":"READ","expiresAt":"2026-12-01T09:00:00.000Z"}
```

### Contract conditions

All IDs above are UUIDs in live API mode; the fictional demo fixture IDs are intentionally not accepted by production endpoints. Decimal land area is a user-declared field, not an authoritative surveyed measurement. Quote amounts are stored in whole UGX. The API is not public-versioned by schema beyond the `/api/v1` prefix; before GA, add OpenAPI documentation and contract tests.
