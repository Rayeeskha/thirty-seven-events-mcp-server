/**
 * Demonstration client. It connects to a running MCP server exactly as an AI assistant would
 * (official SDK client, Streamable HTTP) and walks through every capability, including the
 * confirmation rule. Nothing here is special-cased: it only uses the five public tools.
 *
 *   npm run demo                      interactive: you answer the confirmation questions
 *   npm run demo -- --yes             answers "yes" for you (also used when stdin is not a terminal)
 *   npm run demo -- --no              answers "no": shows that declining leaves the database untouched
 *   MCP_URL=https://host/mcp npm run demo
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import readline from 'node:readline/promises';

const MCP_URL = process.env.MCP_URL ?? 'http://127.0.0.1:3001/mcp';
const AUTO_NO = process.argv.includes('--no');
const AUTO_YES = !AUTO_NO && (process.argv.includes('--yes') || !process.stdin.isTTY);
const DEMO_CLIENT = 'Demo Client Ltd';

interface EventRow { id: number; event_name: string; event_date: string; client: string; budget: number; status: string; number_of_projects: number }
interface Reply { isError: boolean; body: Record<string, unknown> & { error?: { code: string; message: string } } }

const style = (code: number) => (text: string): string => (process.stdout.isTTY ? `\u001b[${code}m${text}\u001b[0m` : text);
const bold = style(1);
const dim = style(2);
const green = style(32);
const red = style(31);
const cyan = style(36);

const section = (title: string): void => console.log(`\n${bold(cyan(`━━ ${title} ━━`))}`);
const user = (text: string): void => console.log(`\n${bold('YOU      ')} ${text}`);
const tool = (name: string, args: object): void => console.log(`${dim(`ASSISTANT calls ${name}(${JSON.stringify(args)})`)}`);
const assistant = (text: string): void => console.log(`${bold('ASSISTANT')} ${text.replace(/\n/g, '\n          ')}`);

const table = (events: EventRow[]): string =>
  events.length === 0
    ? '(no events)'
    : events.map((e) => `#${String(e.id).padEnd(3)} ${e.event_date}  ${e.status.padEnd(11)} ${e.client.padEnd(26)} ${e.event_name}`).join('\n');

async function main(): Promise<void> {
  const client = new Client({ name: 'demo-assistant', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)));
  } catch (error) {
    console.error(red(`Could not connect to ${MCP_URL}`));
    console.error('Is the server running (npm run dev)? A 403 means the Host is not in MCP_ALLOWED_HOSTS.');
    console.error(String(error));
    process.exit(1);
  }

  const call = async (name: string, args: Record<string, unknown> = {}, quiet = false): Promise<Reply> => {
    if (!quiet) tool(name, args);
    const result = await client.callTool({ name, arguments: args });
    const [first] = result.content as { text: string }[];
    try {
      return { isError: Boolean(result.isError), body: JSON.parse(first.text) };
    } catch {
      return { isError: true, body: { error: { code: 'INVALID_INPUT', message: first.text } } };
    }
  };
  const rejected = (reply: Reply): string => (reply.isError ? red(`rejected → ${reply.body.error?.code}`) : red('NOT rejected (unexpected!)'));
  const rl = AUTO_YES || AUTO_NO ? undefined : readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = async (): Promise<boolean> => {
    if (!rl) {
      console.log(`${bold('YOU      ')} ${AUTO_NO ? 'no' : 'yes'} ${dim('(automatic answer)')}`);
      return !AUTO_NO;
    }
    const answer = (await rl.question(`${bold('YOU      ')} Proceed? (y/n) `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  };
  const countDemoEvents = async (): Promise<number> => ((await call('search_events', { client: DEMO_CLIENT }, true)).body as { pagination: { total: number } }).pagination.total;

  try {
    section('1. Connect and discover');
    const server = client.getServerVersion();
    console.log(`Connected to "${server?.name}" v${server?.version} at ${MCP_URL}`);
    console.log(`${dim('Server instructions:')} ${client.getInstructions()}`);
    const { tools } = await client.listTools();
    console.log('Tools offered to the assistant:');
    for (const t of tools) console.log(`  • ${bold(t.name)} — ${t.description?.split('. ')[0].replace(/\.$/, '')}.`);

    section('2. Searching');
    user('Which events do we have for Najd Telecom?');
    assistant(table(((await call('search_events', { client: 'Najd' })).body as { data: EventRow[] }).data));
    user('What is still planned for December 2026?');
    assistant(table(((await call('search_events', { status: 'PLANNED', date_from: '2026-12-01', date_to: '2026-12-31' })).body as { data: EventRow[] }).data));

    section('3. Event details');
    user('Give me everything about event 10.');
    assistant(JSON.stringify((await call('get_event_details', { event_id: 10 })).body, null, 2).replace(/\n/g, '\n          '));

    section('4. Adding an event — requires confirmation');
    const newEvent = { event_name: 'Saudi Tech Expo (demo)', event_date: '2027-05-10', client: DEMO_CLIENT, budget: 310500.5, number_of_projects: 3 };
    user('Create an event called Saudi Tech Expo on 10 May 2027 for Demo Client Ltd, budget 310,500.50 SAR, 3 projects.');
    const proposal = (await call('add_event', newEvent)).body as { summary: string; confirmation_token: string; expires_at: string };
    assistant(`${proposal.summary}`);
    console.log(dim(`          [backend: token issued, expires ${proposal.expires_at}; events for "${DEMO_CLIENT}" in the database so far: ${await countDemoEvents()}]`));
    if (!(await confirm())) {
      assistant(`Understood — nothing was saved. (events for "${DEMO_CLIENT}": ${await countDemoEvents()})`);
      console.log(green('\nYou answered no, so the database was never changed. That is the safety rule working.'));
      return;
    }

    console.log(dim('\n          Before honouring the "yes", let us show the backend refuses misuse of the token:'));
    console.log(`  • same token, but the budget quietly changed to 1  ${rejected(await call('add_event', { ...newEvent, budget: 1, confirmation_token: proposal.confirmation_token }))}`);
    console.log(`  • a made-up token                                  ${rejected(await call('add_event', { ...newEvent, confirmation_token: 'made-up-token' }))}`);
    console.log(dim(`          [events for "${DEMO_CLIENT}" still: ${await countDemoEvents()}]`));

    console.log(dim('\n          Now the genuine confirmation:'));
    const created = (await call('add_event', { ...newEvent, confirmation_token: proposal.confirmation_token })).body as { event: EventRow };
    assistant(`Done — event #${created.event.id} "${created.event.event_name}" has been created.`);
    console.log(dim(`          [events for "${DEMO_CLIENT}" now: ${await countDemoEvents()}]`));
    console.log(`  • replaying the same token (duplicate confirmation) ${rejected(await call('add_event', { ...newEvent, confirmation_token: proposal.confirmation_token }))}`);
    console.log(dim(`          [events for "${DEMO_CLIENT}" still: ${await countDemoEvents()}]`));

    section('5. Changing a status — requires confirmation');
    const id = created.event.id;
    user(`Mark event ${id} as in progress.`);
    const change = (await call('update_event_status', { event_id: id, status: 'IN_PROGRESS' })).body as { summary: string; confirmation_token: string };
    assistant(change.summary);
    const before = ((await call('get_event_details', { event_id: id }, true)).body as unknown as EventRow).status;
    console.log(dim(`          [backend: status in the database is still ${before}]`));
    if (await confirm()) {
      const done = (await call('update_event_status', { event_id: id, status: 'IN_PROGRESS', confirmation_token: change.confirmation_token })).body as { event: EventRow };
      assistant(`Done — event #${id} is now ${done.event.status}.`);
    } else {
      assistant('Understood — the status was not changed.');
    }

    section('6. Marketing content from the stored event data');
    user(`Write an Instagram post for event ${id}, in English and Arabic.`);
    const post = (await call('draft_marketing_message', { event_id: id, channel: 'INSTAGRAM_POST', language: 'BOTH' })).body as { drafts: { language: string; body: string }[] };
    for (const draft of post.drafts) assistant(`[${draft.language}]\n${draft.body}`);
    user(`And a marketing email in Arabic.`);
    const mail = (await call('draft_marketing_message', { event_id: id, channel: 'EMAIL', language: 'AR' })).body as { drafts: { subject: string; body: string }[] };
    assistant(`Subject: ${mail.drafts[0].subject}\n\n${mail.drafts[0].body}`);

    console.log(green(`\n✔ Demo complete. All five tools were used through a real MCP client.`));
    console.log(dim(`  Created: event #${id}. Run "npm run db:reset" to return the database to its seed data.`));
  } finally {
    rl?.close();
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(red('Demo failed:'), error);
  process.exit(1);
});
