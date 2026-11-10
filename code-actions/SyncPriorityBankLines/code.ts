import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { syncPriorityBankLines } from './sync.ts';

// Pulls the bank statement lines (Priority שורות דפי בנק) into BankLines (see ./sync.ts). The Priority API is not
// connected yet, so this returns ok: false with reason "Priority sync not connected yet" and writes nothing. A
// scenario / mockScenario input is still accepted and ignored. dryRun defaults to true. Never writes to Priority.
export const invoke = async (input: any, context: any) => {
  const client = new BlocksClient(context);
  return syncPriorityBankLines(client, input ?? {});
};
