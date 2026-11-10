# Responsive screen inventory and handoff notes

All screens use black, gold and green. The screenshot pack contains one **1440px desktop** and one **390px mobile** render for each route below, generated from the shipped TSX and CSS with fictional fixtures. These static renders do not implement or prove interactive React behavior.

| Route / page | User goal | Primary actions |
|---|---|---|
| Authentication (`auth`) | Start workspace or sign in | Register, log in, accept a team invitation |
| `#dashboard` | Review work overview | Navigate to assets, cases, recent activity |
| `#assets` | Search registered assets | Search/filter, create an asset |
| `#asset-detail/:id` | Inspect claimed asset and records | Open linked cases, request verification |
| `#cases` | Find verification cases | Search and create case |
| `#case-detail/:id` | Document and advance case | Add evidence, advance guarded stage |
| `#documents` | Handle private case documents | Upload, review metadata, authenticated download |
| `#reports` | Prepare non-official evidence summary | Choose case, export JSON, print PDF |
| `#billing` | Review proposed packages | View catalogue only |
| `#audit` | Inspect local history | View local audit events |
| `#notifications` | Handle assignments/concerns | Mark in-app notice as read |
| `#assignments` | Allocate case reviewers | Choose same-org case and user |
| `#team` | Invite colleagues | Invite, inspect roles and accreditation flags |
| `#tasks` | Track case tasks | Add task, mark completed |
| `#disputes` | Flag conflicting evidence | Submit concern; admin resolution |
| `#monitoring` | Schedule recurring checks | Create reminder with due date |
| `#quotes` | Price verification work | Create draft service quote |
| `#access` | Share assets responsibly | Temporary in-organization access grants |
| `#integrations` | Understand external connectivity | View disabled connections and requirements |
| `#settings` | Examine account and scope | View role, org identity and capability states |

Design-system components: typography/wordmark, collapsible desktop sidebar, mobile bottom nav, responsive card grids, green success chips, gold pending/attention states, red concerns, detailed tables, form validation, loading/error states, contextual legal disclaimers. Need further production usability work on empty states, pagination, keyboard screen-reader testing, native mobile app decision and biometric authentication if introduced.
