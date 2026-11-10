import { BlocksClient } from '../shared/blocks/blocks-client.ts';
import { applyMailClassification } from '../shared/collections-mail-route.ts';

// Checks Maya's structured sorting of one inbound email and routes it by code (component 04 · פניות, plan 04.11
// part C). The logic lives in shared/collections-mail-route.ts – ConfirmSender re-runs the same routing for an email
// after a person confirmed its sender. See that file for the full rules.
export const invoke = async (input: any, context: any) => applyMailClassification(new BlocksClient(context), input);
