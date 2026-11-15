declare module '@nestjs/common' {
 export class ForbiddenException extends Error {constructor(message?:string)}
 export class NotFoundException extends Error {constructor(message?:string)}
}
