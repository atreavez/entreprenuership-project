/** INFRASTRUCTURE: the only layer in this vertical slice that knows PostgreSQL and NestJS. */
import {Injectable} from '@nestjs/common';
import {PoolClient} from 'pg';
import {Database} from '../../../database';
import {AuditService} from '../../../audit';
import {WorkflowRepository,WorkflowTransaction} from '../application/evidence-workflow';
import {CaseRecord,ReviewDecision,ReviewActor} from '../domain/evidence-policy';
@Injectable()
export class PostgresWorkflowRepository implements WorkflowRepository{
 constructor(private readonly db:Database,private readonly auditService:AuditService){}
 transaction<T>(work:(tx:WorkflowTransaction)=>Promise<T>):Promise<T>{
  return this.db.transaction(async (connection:PoolClient)=>{
   const tx:WorkflowTransaction={
    getCase:async(id,orgId)=>{
     const {rows}=await connection.query(`SELECT id,organization_id,asset_id,stage,status,assigned_to,created_by
       FROM verification_cases WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[id,orgId]);
     const c=rows[0];return c?{id:c.id,organizationId:c.organization_id,assetId:c.asset_id,
      stage:c.stage,status:c.status,assignedTo:c.assigned_to,createdBy:c.created_by} as CaseRecord:null;
    },
    getEvidence:async(evidenceId,caseId,orgId)=>{
     const {rows}=await connection.query(`SELECT id,stage,evidence_type,recorded_by,review_status,reviewed_by
      FROM case_evidence WHERE id=$1 AND case_id=$2 AND organization_id=$3 FOR UPDATE`,[evidenceId,caseId,orgId]);
     return rows[0]||null;
    },
    getEvidenceForStage:async(caseId,orgId,stage)=>{
     const {rows}=await connection.query(`SELECT id,stage,evidence_type,recorded_by,review_status,reviewed_by
      FROM case_evidence WHERE case_id=$1 AND organization_id=$2 AND stage=$3`,[caseId,orgId,stage]);return rows;
    },
    hasUnresolvedDispute:async(caseId,orgId)=>{
     const {rowCount}=await connection.query(`SELECT 1 FROM disputes WHERE case_id=$1 AND organization_id=$2
       AND status IN ('OPEN','INVESTIGATING') LIMIT 1`,[caseId,orgId]);return !!rowCount;
    },
    recordDecision:async(evidenceId,actorId,decision:ReviewDecision,notes)=>{
     const r=await connection.query(`UPDATE case_evidence SET review_status=$1,reviewed_by=$2,reviewed_at=now(),review_notes=$3
       WHERE id=$4 AND review_status='SUBMITTED' RETURNING id`,[decision,actorId,notes,evidenceId]);
     if(r.rowCount!==1)throw new Error('Concurrent evidence review prevented');
    },
    changeStage:async(caseId,orgId,stage,status)=>{
     const r=await connection.query(`UPDATE verification_cases SET stage=$1,status=$2,updated_at=now()
      WHERE id=$3 AND organization_id=$4 RETURNING id`,[stage,status,caseId,orgId]);
     if(r.rowCount!==1)throw new Error('Cannot update missing case');
    },
    completeAsset:async(assetId,orgId)=>{
     const r=await connection.query(`UPDATE assets SET status='REVIEW_COMPLETED',updated_at=now()
       WHERE id=$1 AND organization_id=$2 RETURNING id`,[assetId,orgId]);
     if(r.rowCount!==1)throw new Error('Cannot update missing asset');
    },
    audit:async(actor:ReviewActor,action:string,caseId:string,details:Record<string,unknown>)=>{
     await this.auditService.write(connection,{...actor,email:'',fullName:''},action,'case',caseId,details);
    }
   };
   return work(tx);
  });
 }
}
