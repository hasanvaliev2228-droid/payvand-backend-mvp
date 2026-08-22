export type UUID = string;
export type ISODateTime = string;
export type ISODate = string;

export interface AuditContext {
  actorId: UUID | null;
  ipHash?: string;
}
