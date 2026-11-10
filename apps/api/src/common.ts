import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
export type Role = 'ORG_ADMIN'|'CLIENT'|'REVIEWER'|'SURVEYOR'|'LEGAL_REVIEWER';
export type UserAuth = { id:string; organizationId:string; role:Role; email:string; fullName:string; professionalApproved:boolean };
export const uid = () => randomUUID();
export const hash = (value:string|Buffer) => createHash('sha256').update(value).digest('hex');
export function text(value:unknown,label:string,max=300,required=true) {
 if (typeof value !== 'string' || (required && !value.trim()) || value.length>max) throw new BadRequestException(`${label} must be ${required?'nonempty ':''}text (max ${max})`);
 return value.trim();
}
export function optionalText(value:unknown,label:string,max=300) { return value===undefined || value===null ? '' : text(value,label,max,false); }
export function isUuid(value:unknown) {
 if(typeof value!=='string'|| !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new BadRequestException('Invalid UUID');return value;
}
export function enumValue<T extends string>(v:unknown, values: readonly T[],name:string):T { if (typeof v!=='string'||!values.includes(v as T)) throw new BadRequestException(`Invalid ${name}`);return v as T; }
export function assertRole(user:UserAuth, roles: Role[], professional=false) {
 if (!roles.includes(user.role)) throw new ForbiddenException('Your role cannot perform this action');
 if (professional && !user.professionalApproved) throw new ForbiddenException('Verified professional accreditation is required for this step');
}
