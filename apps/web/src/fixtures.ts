import type {Asset,Case,DocumentItem,Evidence,Principal} from './api';
export const fixtureUser:Principal={id:'demo-user',organizationId:'demo-org',email:'demo@assettrust.local',fullName:'Aturinzire Hargreave',role:'ORG_ADMIN',professionalApproved:false};
export const fixtureAssets:Asset[]=[
 {id:'demo-1',asset_code:'AT-LA-30821',asset_type:'LAND',district:'Wakiso',description:'Agricultural parcel, Kyengera',declared_owner:'Grace Nammunga',tenure:'Freehold',parcel_reference:'Block 241 Plot 318',area_acres:12.74,status:'IN_REVIEW',created_at:'2026-11-05T09:12:00Z'},
 {id:'demo-2',asset_code:'AT-BU-11890',asset_type:'BUILDING',district:'Kampala',description:'Commercial building, Ntinda',declared_owner:'Mirembe Holdings Ltd',status:'REVIEW_COMPLETED',created_at:'2026-11-04T09:12:00Z'},
 {id:'demo-3',asset_code:'AT-LA-09872',asset_type:'LAND',district:'Mukono',description:'Residential plot',declared_owner:'Kato David',tenure:'Mailo',parcel_reference:'Block 110 Plot 72',area_acres:0.75,status:'UNVERIFIED',created_at:'2026-11-03T09:12:00Z'},
 {id:'demo-4',asset_code:'AT-MA-05503',asset_type:'MACHINERY',district:'Mbarara',description:'Agricultural tractor',declared_owner:'Rwebisengo Cooperative',status:'REVIEW_COMPLETED',created_at:'2026-11-02T09:12:00Z'},
 {id:'demo-5',asset_code:'AT-LA-28539',asset_type:'LAND',district:'Entebbe',description:'Lakefront plot',declared_owner:'Nalubega Susan',tenure:'Leasehold',parcel_reference:'Block 94 Plot 51',area_acres:3.2,status:'FLAGGED',created_at:'2026-11-01T09:12:00Z'}
];
export const fixtureCases:Case[]=[
 {id:'case1',case_code:'AT-VC-20481',asset_id:'demo-1',asset_code:'AT-LA-30821',asset_type:'LAND',district:'Wakiso',declared_owner:'Grace Nammunga',stage:'REGISTRY_SEARCH',status:'OPEN',created_at:'2026-11-05T10:00:00Z'},
 {id:'case2',case_code:'AT-VC-20511',asset_id:'demo-2',asset_code:'AT-BU-11890',asset_type:'BUILDING',district:'Kampala',declared_owner:'Mirembe Holdings Ltd',stage:'CLOSED',status:'CLOSED',created_at:'2026-11-03T09:30:00Z'},
 {id:'case3',case_code:'AT-VC-20581',asset_id:'demo-5',asset_code:'AT-LA-28539',asset_type:'LAND',district:'Entebbe',declared_owner:'Nalubega Susan',stage:'DOCUMENT_REVIEW',status:'BLOCKED',created_at:'2026-11-01T09:30:00Z'}
];
export const fixtureDocuments:DocumentItem[]=[
 {id:'doc1',asset_id:'demo-1',case_id:'case1',display_name:'Submitted Land Title.pdf',file_size:268902,sha256:'d5f0a1e6cf3f98b44a79c503ab57a708e6b3f9764bd6c77b0698c6c954f110a2',review_status:'SUBMITTED',storage_format:'AES_256_GCM_V1',created_at:'2026-11-05T10:05:00Z'},
 {id:'doc2',asset_id:'demo-1',case_id:'case1',display_name:'Boundary Survey.pdf',file_size:1324561,sha256:'79ea53b2f48d73af47eea66c5b56ae4a4ec7ec9c1836c6d409195b8967f10422',review_status:'REVIEWED',storage_format:'AES_256_GCM_V1',created_at:'2026-11-05T10:06:00Z'},
 {id:'doc3',asset_id:'demo-1',case_id:'case1',display_name:'Search Request.pdf',file_size:176450,sha256:'a0f0f1e5fca530b5ddadd18dc6fb3879d1f96857b1d53f2e1e67d1088edab36e',review_status:'SUBMITTED',storage_format:'AES_256_GCM_V1',created_at:'2026-11-05T10:08:00Z'},
 {id:'doc4',asset_id:'demo-2',case_id:'case2',display_name:'Building Inspection.pdf',file_size:432871,sha256:'b1119e9fcd0687092bd2ecb6818b3b12e93e76337812436d8b5398cbf721c199',review_status:'REVIEWED',storage_format:'AES_256_GCM_V1',created_at:'2026-11-04T10:05:00Z'}
];
export const fixtureEvidence:Evidence[]=[
 {id:'ev1',stage:'INTAKE',evidence_type:'IDENTITY',source_name:'Client identification interview',reference:'INT-001',observations:'Identity submitted for human review; not government authenticated.',review_status:'ACCEPTED',recorded_by:'external-reviewer',reviewed_by:'demo-user',review_notes:'Document origin and limitations recorded.',created_at:'2026-11-05T10:10:00Z'},
 {id:'ev3',stage:'REGISTRY_SEARCH',evidence_type:'REGISTRY_SEARCH',source_name:'Search request submitted by staff',reference:'TEST-RGS-203',observations:'Awaiting an attributable official search result; submitted evidence must be reviewed before the case may advance.',review_status:'SUBMITTED',recorded_by:'external-reviewer',reviewed_by:null,created_at:'2026-11-05T14:10:00Z'},
 {id:'ev2',stage:'DOCUMENT_REVIEW',evidence_type:'DOCUMENT',source_name:'Submitted title copy',reference:'DOC-002',observations:'Page legibility reviewed. Registry validation still pending.',review_status:'SUBMITTED',recorded_by:'demo-user',reviewed_by:null,created_at:'2026-11-05T13:10:00Z'}
];
