import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { explainLine } from './explain.ts';

// Nina's read-only explain tool. Since plan 04.11 part B stage 5 it explains ONE bank line in the new receipts flow:
// the customer identification (confidence against identifyCertainAt) and the debt check against the customer's due
// months – the result stored on the approved receipt, or a preview of what CheckDebt will decide. It no longer explains
// an invoice match (the stage-1 ladder is retired). Read-only by construction (dryRun forced in code; there is no dryRun
// input): nothing is written to any table. A code action cannot tell an agent caller from a person, so Nina gets this
// action and not the writing ones. Logic: ./explain.ts.
export const invoke = async (input: any, context: any) => explainLine(new BlocksClient(context), input ?? {});
