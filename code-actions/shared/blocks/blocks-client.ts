// eslint-disable-next-line import/no-extraneous-dependencies -- axios is supplied by the Lambda bundler.
import axios from 'axios';

import { blocksClientMappings } from './blocks-client-mappings.ts';

/**
 * Represents a user's data
 * @interface User
 * @property {string} [id] - The user's ID (optional, must exist if user is authenticated)
 * @property {string} [tenantId] - The user's tenant ID (optional, only exists if user is authenticated and app is multi-tenant)
 * @property {string} [name] - The user's name (optional, must exist if user is authenticated)
 * @property {string} [firstName] - The user's first name (optional, must exist if user is authenticated)
 * @property {string} [lastName] - The user's last name (optional, must exist if user is authenticated)
 * @property {string} [email] - The user's email (optional, must exist if user is authenticated)
 * @property {Date} [createdAt] - The user creation time
 * @property {Date} [updatedAt] - The user last update time
 * @property {string} [permission] - The user's permission use/build (optional, must exist if user is authenticated)
 * @property {string} [profileImageUrl] - The user's profile image URL (optional)
 * @property {string} [role] - The user's role name (optional)
 * @property {boolean} [isAuthenticated] - true if the user is authenticated, false otherwise
 */
export interface User {
  id: string;
  tenantId?: string;
  name: string | null;
  firstName: string | undefined;
  lastName: string | undefined;
  email: string;
  createdAt: Date;
  updatedAt: Date | null;
  permission: string | null;
  profileImageUrl?: string | null;
  role?: string;
  isAuthenticated?: boolean;
}

// the blocks context passed as 2nd parameter to the code action entry point `invoke` method
interface BlocksContext {
  token: string;
  appId: string;
  userId: number;
  accountId: number;
  secrets: Record<string, string>;
  mainWorkflowId: string;
  appVersion?: number;
  /**
   * The app this run's activity rows are filed under, when that is not
   * `appId`. Set only for an action reached through an app dependency: it
   * executes as its host app (`appId`), while the run it is part of still
   * belongs to the caller, who is the one watching it. Absent means the two
   * coincide.
   */
  logAppId?: string;
  /** The `appVersion` that goes with `logAppId`; a pair, never mixed. */
  logAppVersion?: number;
  /**
   * How deep in a data-trigger cascade the run that invoked this code action is.
   * Sent back on every call, so a write made here keeps counting toward the
   * loop guard instead of restarting it at zero. Absent outside a cascade.
   */
  triggerDepth?: number;
}

const ACTION_RESULT_MEDIA_TYPE = 'application/vnd.blocks.action-result.v1+json';

// The structured `code` wf-service answers a sync start of a durable action with.
const DURABLE_REQUIRES_ASYNC = 'DURABLE_REQUIRES_ASYNC';

/**
 * A platform API call failed. `statusCode` is the HTTP status (or the status inside a
 * streamed action's error envelope); `code` is the structured error code from the
 * response body, when the service sent one — branch on it, never on `message`.
 */
export class BlocksApiError extends Error {
  readonly statusCode?: number;
  readonly code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = 'BlocksApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Where a run of an action stands; `progress` is reported for durable runs. */
/** A step or loop of a durable run that failed after its retries and waits for a resume. */
export interface ActionRunWaitingEntry {
  kind: 'step' | 'loop';
  blockId: string;
  name?: string;
  error?: string;
  /** The loop item that failed, for a `loop` entry. */
  index?: number;
}

export interface ActionRunStatus {
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string;
  /** Present while the run is paused after a failure, waiting for `resumeActionRun` (up to 24 hours). */
  awaitingRetry?: ActionRunWaitingEntry[];
  /** True while the run is paused on request (`pauseActionRun`), until `resumeActionRun`. */
  paused?: boolean;
  /** False while something is waiting synchronously on the run, so a pause would be refused (RUN_NOT_PAUSABLE). */
  pausable?: boolean;
  progress?: {
    loops: {
      loopKey: string;
      blockId: string;
      total: number;
      succeeded: number;
      failed: number;
      inFlight: number;
    }[];
  };
}

function errorCode(body: unknown): string | undefined {
  const code =
    body && typeof body === 'object'
      ? (body as { code?: unknown }).code
      : undefined;
  return typeof code === 'string' ? code : undefined;
}

// A clause is either a single condition (`column` + `value`) or a group (`and` / `or`)
// of nested clauses. Everything is optional, so write only the parts you need:
//   { column: 'status', value: 'open' }
//   { and: [{ column: 'checkId', value: id }, { column: 'documentName', value: name }] }
// Parts that appear together are AND-ed, so `{ column, value, and: [...] }` means
// "this condition AND all of these" - but the nested form above reads clearer.
export interface WhereClause {
  column?: string; // Column name to filter, can be prefixed with table alias
  operator?:
    | '='
    | '>'
    | '>='
    | '<'
    | '<='
    | '!='
    | 'in'
    | 'not in'
    | 'is null'
    | 'is not null'; // Default: '='
  value?: any; // Column value ('in' / 'not in' take an array; null checks take none)
  and?: WhereClause[]; // Array of conditions that must all be true (AND operation)
  or?: WhereClause[]; // Array of conditions where at least one must be true (OR operation)
  not?: boolean; // Negates this clause (NOT operation)
}

export interface QueryOptions {
  from: {
    table: string; // Table Name
    as?: string; // Table alias
  };
  join?: {
    table: string; // Table Name
    as?: string; // Table alias
    type?: 'inner' | 'left' | 'right' | 'full'; // Default: 'inner'
    on: {
      left: string; // Column from the main table, can be prefixed with table alias
      right: string; // Column from the joined table, can be prefixed with table alias
      operator?: '=' | '>' | '>=' | '<' | '<=' | '!=' | 'in'; // Default: '='
    }[];
  }[];
  select?: {
    column: string; // Column name to select, can be prefixed with table alias
    as?: string; // Alias for the column
    function?: 'count' | 'sum' | 'avg' | 'min' | 'max'; // Default: undefined
  }[];
  where?: WhereClause;
  groupBy?: string[]; // list of column names, can be prefixed with table alias
  orderBy?: {
    column: string; // Column name to order by, can be prefixed with table alias
    direction?: 'asc' | 'desc'; // Default: 'asc'
  }[];
  limit?: number; // Max number of rows to return
  offset?: number; // Starting offset for pagination
}

export type Item = Record<string, any>;

export class BlocksClient {
  private readonly basePath: string;
  private readonly context: BlocksContext;
  constructor(context: BlocksContext) {
    this.basePath = process.env.BLOCKS_BASE_PATH as string;
    this.context = context;
  }

  private async apiCall(
    method: string,
    url: string,
    data?: any,
    streamAction = false,
  ) {
    const finalUrl = `${this.basePath}${url}`;

    const response = await axios.request({
      method,
      url: finalUrl,
      data: data ? JSON.stringify(data) : undefined,
      headers: {
        ...(streamAction
          ? { Accept: ACTION_RESULT_MEDIA_TYPE, 'Accept-Encoding': 'identity' }
          : {}),
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.context.token}`,
        'x-app-id': this.context.appId,
        'x-app-version': this.context.appVersion,
        ...this.requestContextHeader(),
        'user-agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      },
      validateStatus: () => true, // Accept any status code without throwing
    });

    if (response.status >= 300) {
      const msg = `Failed to ${method} call ${url}: ${response.statusText}`;
      console.error(msg);
      throw new BlocksApiError(msg, response.status, errorCode(response.data));
    }
    if (
      streamAction &&
      response.headers['content-type']?.split(';')[0].trim() ===
        ACTION_RESULT_MEDIA_TYPE
    ) {
      const envelope = response.data;
      if (
        !envelope ||
        typeof envelope !== 'object' ||
        typeof envelope.ok !== 'boolean'
      ) {
        throw new Error('Invalid action response');
      }
      if (!envelope.ok) {
        if (typeof envelope.error?.message !== 'string') {
          throw new Error('Invalid action error response');
        }
        throw new BlocksApiError(
          `Action failed (HTTP ${envelope.error.statusCode}): ${envelope.error.message}`,
          envelope.error.statusCode,
          errorCode(envelope.error),
        );
      }
      return envelope.output;
    }
    // An older server ignores Accept and still returns the original JSON result.
    return response.data;
  }

  // The platform's request-context envelope (base64 JSON), carrying only the
  // trigger depth: data-service reads the depth of a write from it alone, and
  // wf-service starts a nested run from it.
  private requestContextHeader(): Record<string, string> {
    const { triggerDepth } = this.context;
    if (typeof triggerDepth !== 'number') {
      return {};
    }
    return {
      'x-request-context': Buffer.from(
        JSON.stringify({ triggerDepth }),
        'utf-8',
      ).toString('base64'),
    };
  }

  private actionPath(actionName: string): string {
    const actionId = blocksClientMappings[actionName];
    if (!actionId) {
      throw new Error(`action ${actionName} not found`);
    }
    // The ref must occupy exactly ONE path segment. Under the unified (v2) block model it is a
    // named ref (`productSlug/BlockName`, plus `&`-joined segments for a table-ops tool), and
    // wf-service serves only single-segment `:workflowId` routes — a raw `/` becomes a second
    // segment and matches no route (404). Encoded, it round-trips: Express decodes the param
    // and blocks-store resolves the qualified ref. Same contract wf-service already enforces on
    // its own outbound calls (blocks-store-url.util.ts). Byte-identical for a plain block id,
    // so apps on the older block model keep the exact URL they use today; their `&`-joined
    // composites become `%26`, which the route decodes back before splitting on `&`.
    return `/workflow/api/${encodeURIComponent(actionId)}`;
  }

  private actionBody(input: any) {
    return {
      input,
      context: {
        appId: this.context.appId,
        mainWorkflowId: this.context.mainWorkflowId,
        // Carried, not re-derived: a nested call out of a dependency code
        // action is still a step of the caller's run, so its rows have to
        // keep landing in the caller's feed rather than under the host app
        // this code happens to execute as.
        logAppId: this.context.logAppId,
        logAppVersion: this.context.logAppVersion,
      },
    };
  }

  /**
   * Runs an action and waits for its output. A durable action cannot be run this
   * way: start it with `invokeActionAsync` instead.
   */
  async invokeAction(actionName: string, input: any) {
    const path = this.actionPath(actionName);
    try {
      return await this.apiCall('POST', path, this.actionBody(input), true);
    } catch (error) {
      if (
        error instanceof BlocksApiError &&
        error.code === DURABLE_REQUIRES_ASYNC
      ) {
        throw new BlocksApiError(
          `Action ${actionName} is durable and can only be started asynchronously: ` +
            `use invokeActionAsync('${actionName}', input) and check it with getActionRunStatus(workflowId).`,
          error.statusCode,
          error.code,
        );
      }
      throw error;
    }
  }

  /**
   * Starts an action without waiting for it (the only way to start a durable action).
   * Check on the run with `getActionRunStatus(workflowId)`; never poll it in a loop
   * here — a code action has a hard time limit.
   */
  async invokeActionAsync(
    actionName: string,
    input: any,
  ): Promise<{ workflowId: string; runId?: string; asyncId?: string }> {
    const path = this.actionPath(actionName);
    return this.apiCall('POST', `${path}/async`, this.actionBody(input));
  }

  /** Status of a run started with `invokeActionAsync`. */
  async getActionRunStatus(workflowId: string): Promise<ActionRunStatus> {
    return this.apiCall(
      'GET',
      `/workflow/api/${encodeURIComponent(workflowId)}/status`,
    );
  }

  /** Asks a run started with `invokeActionAsync` to stop. */
  async cancelActionRun(
    workflowId: string,
  ): Promise<{ workflowId: string; status: string }> {
    return this.apiCall(
      'POST',
      `/workflow/api/${encodeURIComponent(workflowId)}/cancel`,
    );
  }

  /**
   * Pauses a durable run: no new step or loop item starts until `resumeActionRun`; what is
   * running finishes, and nothing fails or uses up its retries. Fails with code
   * RUN_NOT_RUNNING (409) once the run has ended, RUN_NOT_PAUSABLE (409) when something is
   * waiting synchronously on it, RUN_NOT_CONTROLLABLE (400) for a run started before run control existed.
   */
  async pauseActionRun(
    workflowId: string,
  ): Promise<{ workflowId: string; status: string }> {
    return this.apiCall(
      'POST',
      `/workflow/api/${encodeURIComponent(workflowId)}/pause`,
    );
  }

  /**
   * Resumes a paused durable run — paused on request (`paused`) or after a failure (its status
   * lists `awaitingRetry`): failed steps and loop items run again, everything that succeeded
   * stays done. Same run, same workflowId. Fails with code RUN_NOT_RESUMABLE (409) once the run
   * has ended, NOTHING_TO_RESUME (409) when it isn't paused, RUN_NOT_CONTROLLABLE (400) for a run started before
   * run control existed.
   */
  async resumeActionRun(
    workflowId: string,
  ): Promise<{ workflowId: string; retried: ActionRunWaitingEntry[] }> {
    return this.apiCall(
      'POST',
      `/workflow/api/${encodeURIComponent(workflowId)}/resume`,
    );
  }

  async generateFileSignedUrl(
    fileUrl: string,
  ): Promise<{ signedUrl: string; expiration: Date }> {
    const response = await this.invokeAction('GenerateFileSignedUrl', {
      fileUrl,
    });

    return response;
  }

  /**
   * The app's two absolute addresses, no trailing slash — append a path to link
   * into it (e.g. in an email):
   * - `standaloneUrl` — its own public address: the custom domain when one is set
   *   up, else its Blocks app URL. For customers, the public, anyone outside the
   *   app's Blocks workspace: `${standaloneUrl}/orders/123`.
   * - `platformUrl` — the app inside the Blocks platform, for workspace members.
   *   The path goes in `app-path`: `${platformUrl}/v?app-path=/orders/123`.
   */
  async getAppLinks(): Promise<{ standaloneUrl: string; platformUrl: string }> {
    return this.apiCall(
      'GET',
      `/api/domains/app-links/${encodeURIComponent(this.context.appId)}`,
    );
  }

  async getCurrentUser(): Promise<{ user: User }> {
    const response = await this.apiCall('GET', `/app-users/api/current`);
    return { user: response };
  }

  async createItem(tableName: string, item: Item): Promise<{ item: Item }> {
    const response = await this.apiCall(
      'POST',
      `/data/api/tables/${tableName}/items`,
      [item],
    );
    return { item: response.items[0] };
  }

  async createItems(
    tableName: string,
    items: Item[],
  ): Promise<{ items: Item[] }> {
    const response = await this.apiCall(
      'POST',
      `/data/api/tables/${tableName}/items`,
      items,
    );
    return response;
  }

  async getItem(tableName: string, itemId: string): Promise<{ item: Item }> {
    const response = await this.apiCall(
      'GET',
      `/data/api/tables/${tableName}/items/${itemId}`,
    );
    return response;
  }

  async updateItem(
    tableName: string,
    itemId: string,
    item: Item,
  ): Promise<{ item: Item }> {
    const response = await this.apiCall(
      'PUT',
      `/data/api/tables/${tableName}/items/${itemId}`,
      item,
    );
    return response;
  }

  async updateItems(
    tableName: string,
    items: Item[],
  ): Promise<{ items: Item[] }> {
    const response = await this.apiCall(
      'PUT',
      `/data/api/tables/${tableName}/items`,
      { items },
    );
    return response;
  }

  async deleteItem(
    tableName: string,
    itemId: string,
  ): Promise<{ itemId: string }> {
    const response = await this.apiCall(
      'DELETE',
      `/data/api/tables/${tableName}/items/${itemId}`,
    );
    return response;
  }

  /**
   * Deletes the rows `where` matches. A `where` that matches no specific rows
   * (an unknown column, an empty clause) is rejected with 400; to delete every
   * row in the table pass `{ allItems: true }` instead.
   */
  async deleteItems(
    tableName: string,
    body: { where: WhereClause; allItems?: boolean } | { allItems: true },
  ): Promise<{ itemIds: string[] }> {
    const response = await this.apiCall(
      'POST',
      `/data/api/tables/${tableName}/items/delete`,
      body,
    );
    return response;
  }

  async queryTable(
    tableName: string,
    query: QueryOptions,
  ): Promise<{ items: Item[] }> {
    const response = await this.apiCall(
      'POST',
      `/data/api/tables/${tableName}/query`,
      query,
    );
    return response;
  }
}
