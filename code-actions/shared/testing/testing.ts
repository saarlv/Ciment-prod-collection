/**
 * Offline test helpers for code actions (code-actions/shared/testing/testing.ts).
 * Specs import from `../../shared/testing/testing.ts` (from tests/).
 * Not imported by the Lambda handler — safe to leave in shared/ at deploy time.
 */
import { vi } from 'vitest';

export interface BlocksContext {
  token: string;
  appId: string;
  userId: number;
  accountId: number;
  secrets: Record<string, string>;
  mainWorkflowId: string;
  appVersion?: string;
}

export type Item = Record<string, any>;

/** Minimal BlocksClient surface used by code actions — all methods are vi.fn stubs. */
export interface MockBlocksClient {
  invokeAction: ReturnType<typeof vi.fn>;
  invokeActionAsync: ReturnType<typeof vi.fn>;
  getActionRunStatus: ReturnType<typeof vi.fn>;
  cancelActionRun: ReturnType<typeof vi.fn>;
  pauseActionRun: ReturnType<typeof vi.fn>;
  resumeActionRun: ReturnType<typeof vi.fn>;
  generateFileSignedUrl: ReturnType<typeof vi.fn>;
  getAppLinks: ReturnType<typeof vi.fn>;
  getCurrentUser: ReturnType<typeof vi.fn>;
  createItem: ReturnType<typeof vi.fn>;
  createItems: ReturnType<typeof vi.fn>;
  getItem: ReturnType<typeof vi.fn>;
  updateItem: ReturnType<typeof vi.fn>;
  updateItems: ReturnType<typeof vi.fn>;
  deleteItem: ReturnType<typeof vi.fn>;
  deleteItems: ReturnType<typeof vi.fn>;
  queryTable: ReturnType<typeof vi.fn>;
}

const DEFAULT_CONTEXT: BlocksContext = {
  token: 'test-token',
  appId: 'test-app-id',
  userId: 1,
  accountId: 1,
  secrets: {},
  mainWorkflowId: 'test-workflow-id',
  appVersion: 'draft',
};

/**
 * Build a fake BlocksContext for invoke(input, context). Override secrets (and any
 * other field) per test.
 */
export function createTestContext(
  overrides: Partial<BlocksContext> = {},
): BlocksContext {
  return {
    ...DEFAULT_CONTEXT,
    ...overrides,
    secrets: {
      ...DEFAULT_CONTEXT.secrets,
      ...(overrides.secrets ?? {}),
    },
  };
}

/**
 * Build a mock BlocksClient. Every method is a vitest vi.fn(); pass overrides to
 * replace specific methods (e.g. queryTable returning fixture rows).
 *
 * Use with:
 *   vi.mock('../../shared/blocks/blocks-client.ts', () => ({
 *     BlocksClient: vi.fn(function (this: any) {
 *       return mockClient;
 *     }),
 *   }));
 */
export function createMockBlocksClient(
  overrides: Partial<MockBlocksClient> = {},
): MockBlocksClient {
  return {
    invokeAction: vi.fn(async () => ({})),
    invokeActionAsync: vi.fn(async () => ({ workflowId: 'workflow-1' })),
    getActionRunStatus: vi.fn(async () => ({ status: 'COMPLETED' })),
    cancelActionRun: vi.fn(async (workflowId: string) => ({
      workflowId,
      status: 'CANCELLING',
    })),
    pauseActionRun: vi.fn(async (workflowId: string) => ({
      workflowId,
      status: 'PAUSING',
    })),
    resumeActionRun: vi.fn(async (workflowId: string) => ({
      workflowId,
      retried: [],
    })),
    generateFileSignedUrl: vi.fn(async (fileUrl: string) => ({
      signedUrl: `https://signed.example/${encodeURIComponent(fileUrl)}`,
      expiration: new Date(Date.now() + 3600_000),
    })),
    getAppLinks: vi.fn(async () => ({
      standaloneUrl: 'https://app-1.blocks.example',
      platformUrl: 'https://blocks.example/apps/app-1',
    })),
    getCurrentUser: vi.fn(async () => ({
      user: {
        id: 'user-1',
        name: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: null,
        permission: 'build',
        isAuthenticated: true,
      },
    })),
    createItem: vi.fn(async (_table: string, item: Item) => ({
      item: { id: 'item-1', ...item },
    })),
    createItems: vi.fn(async (_table: string, items: Item[]) => ({
      items: items.map((item, i) => ({ id: `item-${i + 1}`, ...item })),
    })),
    getItem: vi.fn(async () => ({ item: { id: 'item-1' } })),
    updateItem: vi.fn(async (_table: string, itemId: string, item: Item) => ({
      item: { id: itemId, ...item },
    })),
    updateItems: vi.fn(async (_table: string, items: Item[]) => ({ items })),
    deleteItem: vi.fn(async (_table: string, itemId: string) => ({ itemId })),
    deleteItems: vi.fn(async () => ({ itemIds: [] as string[] })),
    queryTable: vi.fn(async () => ({ items: [] as Item[] })),
    ...overrides,
  };
}
