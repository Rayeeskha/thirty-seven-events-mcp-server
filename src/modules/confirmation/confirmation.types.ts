export const OPERATION_TYPES = ['CREATE_EVENT', 'UPDATE_EVENT_STATUS'] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

/** Returned instead of performing a write when no confirmation token was supplied. */
export interface ConfirmationRequired<TProposed> {
  outcome: 'CONFIRMATION_REQUIRED';
  operation: OperationType;
  summary: string;
  proposed: TProposed;
  confirmation_token: string;
  expires_at: string;
  instructions: string;
}
