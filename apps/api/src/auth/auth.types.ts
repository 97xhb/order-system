import type { Request } from 'express';

export interface AuthenticatedAdmin {
  id: string;
  username: string;
  displayName: string;
}

export interface AuthenticatedAdminRequest extends Request {
  admin: AuthenticatedAdmin;
  adminSessionId: string;
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  deviceFingerprint?: string;
  deviceName?: string;
}
