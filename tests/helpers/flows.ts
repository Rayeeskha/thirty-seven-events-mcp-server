import { expect } from '@jest/globals';
import { ConfirmationRequired } from '../../src/modules/confirmation/confirmation.types';
import { EventCreated, EventStatusUpdated, StatusChangeProposal } from '../../src/modules/events/event-command.service';
import { CreateEventInput } from '../../src/modules/events/event.validation';
import { McpDriver, Params, Result } from './drivers';

/** Codes a malformed input produces: the REST validator, or the MCP SDK's own schema check. */
export const VALIDATION_REJECTION = ['VALIDATION_ERROR', 'MCP_INPUT_VALIDATION'];

export const NEW_EVENT = {
  event_name: 'Saudi Tech Expo',
  event_date: '2027-05-10',
  client: 'Kingdom Fintech Council',
  budget: 310500.5,
  number_of_projects: 3,
};

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Expected success but got ${result.code}: ${result.message}`);
  return result.value;
}

export function expectRejected<T>(result: Result<T>, codes: string | string[]): void {
  const accepted = Array.isArray(codes) ? codes : [codes];
  if (result.ok) throw new Error(`Expected rejection with ${accepted.join('|')} but the call succeeded`);
  expect(accepted).toContain(result.code);
}

export async function proposeCreate(driver: McpDriver, input: Params = NEW_EVENT): Promise<ConfirmationRequired<CreateEventInput>> {
  const value = unwrap(await driver.addEvent(input));
  if (value.outcome !== 'CONFIRMATION_REQUIRED') throw new Error('Expected a confirmation proposal, but the event was created');
  return value;
}

export async function confirmCreate(driver: McpDriver, token: string, input: Params = NEW_EVENT): Promise<EventCreated> {
  const value = unwrap(await driver.addEvent({ ...input, confirmation_token: token }));
  if (value.outcome !== 'EXECUTED') throw new Error('Expected the event to be created');
  return value;
}

export async function proposeStatus(
  driver: McpDriver,
  eventId: number,
  status: string,
): Promise<ConfirmationRequired<StatusChangeProposal>> {
  const value = unwrap(await driver.updateEventStatus(eventId, { status }));
  if (value.outcome !== 'CONFIRMATION_REQUIRED') throw new Error('Expected a confirmation proposal, but the status was changed');
  return value;
}

export async function confirmStatus(driver: McpDriver, eventId: number, status: string, token: string): Promise<EventStatusUpdated> {
  const value = unwrap(await driver.updateEventStatus(eventId, { status, confirmation_token: token }));
  if (value.outcome !== 'EXECUTED') throw new Error('Expected the status to be changed');
  return value;
}
