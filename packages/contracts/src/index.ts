export enum ReviewStatus {
  Draft = 'DRAFT',
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Rejected = 'REJECTED',
}

export enum OrderStatus {
  Active = 'ACTIVE',
  Cancelled = 'CANCELLED',
}

export enum ShipmentStatus {
  NotShipped = 'NOT_SHIPPED',
  Shipped = 'SHIPPED',
  Delivered = 'DELIVERED',
  Exception = 'EXCEPTION',
}

export enum SettlementStatus {
  Unpaid = 'UNPAID',
  Partial = 'PARTIAL',
  Paid = 'PAID',
  Exception = 'EXCEPTION',
}

export enum FundingType {
  SelfPaid = 'SELF_PAID',
  SubmitterAdvanced = 'SUBMITTER_ADVANCED',
  Other = 'OTHER',
}

export interface ApiEnvelope<T> {
  data: T;
  requestId?: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
