import { CreateEventInput } from './event.validation';
import { EventDto, EventStatus } from './event.types';

const budgetFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function summarizeCreateEvent(input: CreateEventInput): string {
  return [
    'I am going to create the following event:',
    `Event name: ${input.event_name}`,
    `Date: ${input.event_date}`,
    `Client: ${input.client}`,
    `Budget: SAR ${budgetFormatter.format(input.budget)}`,
    `Number of projects: ${input.number_of_projects}`,
    `Status: ${input.status}`,
    '',
    'Would you like me to proceed?',
  ].join('\n');
}

export function summarizeStatusChange(event: EventDto, newStatus: EventStatus): string {
  return [
    'I am going to change the status of the following event:',
    `Event: #${event.id} ${event.event_name}`,
    `Client: ${event.client}`,
    `Date: ${event.event_date}`,
    `Status: ${event.status} -> ${newStatus}`,
    '',
    'Would you like me to proceed?',
  ].join('\n');
}

export function confirmationInstructions(expiresAt: Date): string {
  return (
    'Nothing has been saved yet. Show the summary to the user and ask whether to proceed. ' +
    'Only if the user explicitly confirms, call this operation again with exactly the same parameters ' +
    `plus the confirmation_token. The token is single-use and expires at ${expiresAt.toISOString()}. ` +
    'Never assume or infer confirmation.'
  );
}
