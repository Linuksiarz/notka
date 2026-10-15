import { apiRequest } from './client';

/** A sample sign-in a demo instance offers; the password is public there by design. */
interface DemoAccount {
  email: string;
  password: string;
}

export interface InstanceInfo {
  demo: boolean;
  demoAccounts: DemoAccount[];
  /** Whether a sign-up would be accepted now; the sign-in screen offers it only then. */
  registrationOpen: boolean;
  /** Days a trashed note stays before it is deleted for good. */
  trashRetentionDays: number;
}

/** What is assumed while the health endpoint has not answered, or could not be reached. */
export const DEFAULT_INSTANCE_INFO: InstanceInfo = {
  demo: false,
  demoAccounts: [],
  registrationOpen: false,
  trashRetentionDays: 30
};

/**
 * How this instance is configured. `/api/health` needs no session, so this can be read before
 * anybody signs in — which is exactly when the demo accounts are worth offering.
 */
export async function fetchInstanceInfo(): Promise<InstanceInfo> {
  const body = await apiRequest<Partial<InstanceInfo>>('/health');
  return {
    demo: body.demo === true,
    demoAccounts: Array.isArray(body.demoAccounts) ? body.demoAccounts : [],
    registrationOpen: body.registrationOpen === true,
    trashRetentionDays:
      typeof body.trashRetentionDays === 'number'
        ? body.trashRetentionDays
        : DEFAULT_INSTANCE_INFO.trashRetentionDays
  };
}
