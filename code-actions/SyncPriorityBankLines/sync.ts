// SyncPriorityBankLines' logic lives in shared/priority-bank-sync.ts since plan 04.11 stage 2, so the work day
// (RunDaySchedule's bank-check phase) runs the very same pull in-process. Re-exported here for the action and its specs.
export * from '../shared/priority-bank-sync.ts';
