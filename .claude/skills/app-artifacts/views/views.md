# View Artifacts

> Part of the [`app-artifacts`](../SKILL.md) skill. Read this before creating/deleting a view.

Views are read-only derived datasets. Define each as `artifacts/views/<Name>.json` — e.g. `OrderSummary.json`. After changes, run **`pnpm gen:types`**.

## View or table?

Create a **view** when the UI needs joins across tables (order + customer name on one row), aggregations (counts, sums, averages), filtered subsets (low-stock products, open orders), or computed columns on top of a base query. Create a **table** only for plain single-table CRUD storage. Never put derived/joined/aggregated data in a table artifact just to get an entity export.

A view reads from its source table, so a brand-new view returns no rows until that table has data.

**Joining the platform `Users` table from a view works, but verify it — complex views can still 500.** `Users` is synthesized from identity data rather than stored, and it is resolved by special cases in the query builder. Simple views that join it return rows (verified on two apps), but a view with several joins and a wide select failed with `cannot call jsonb_to_recordset on a non-array` — a known residual defect, not something your artifact can spell differently. So: prefer a `reference` column on the **base table** (e.g. `assigneeEmail` → `Users.email`) and read the row through the view, which is the pattern proven to work; if you do join `Users` from a view, query it once and confirm it returns rows before building UI on it.

## Entity exports in `product-types.ts`

View artifacts use the **same naming as tables** in generated types:

| View artifact `name` | Import in frontend                                  |
| -------------------- | --------------------------------------------------- |
| `LowStockProducts`   | `LowStockProductsEntity`, `ILowStockProductsEntity` |
| `OrdersOverview`     | `OrdersOverviewEntity`, `IOrdersOverviewEntity`     |

The frontend imports these from `@/product-types` and reads them with **`useEntityGetAll` / `useEntityGetOne` only** — views cannot be created, updated, or deleted from the UI. Create the view artifact and run `pnpm gen:types` before the UI that consumes it.

**A view does not update itself after a write, so never render a mutable list straight from one.** Websocket live sync invalidates the _table_ a write lands in; a view is computed on the server and no event maps that table back to the views built on it, so the view's cached rows stay as they were. `refetch()` is not an escape hatch — it is a deliberate no-op for **every** entity in the SDK (the cache is meant to stay fresh via mutation writes plus live sync), and `refetchOnWindowFocus` is off. So a screen that writes a row and expects the view to update **looks broken**: the button appears dead even though the write succeeded. Pattern that works: read and mutate the **base table** entity, which is live, and take only the _derived_ fields — computed columns, joined labels, aggregates — from the view. Applies to every screen with an inline status change, claim/assign action, or editable field over a view-backed list.

## JSON schema

```json
{
  "type": "object",
  "required": ["name", "query", "calculatedColumns"],
  "properties": {
    "name": { "type": "string", "description": "View name" },
    "legacyName": {
      "type": "string",
      "readOnly": true,
      "description": "Read-only. Seeded previous title when it differed from name. Do not author or change. Kept for backward compatibility with existing apps; the user may refer to the view by this name as well."
    },
    "description": {
      "type": "string",
      "description": "User-friendly description, short and concise"
    },
    "technicalDescription": {
      "type": "string",
      "description": "Intent, meaning, dependencies, and how data is used"
    },
    "permission": {
      "type": "object",
      "properties": {
        "type": { "enum": ["private", "public", "publicRead", "publicWrite"] }
      }
    },
    "query": {
      "type": "object",
      "description": "Source query for the view",
      "properties": {
        "from": {
          "type": "object",
          "description": "The main table to select from",
          "properties": {
            "table": {
              "type": "string",
              "description": "Table name (case sensitive)"
            },
            "as": { "type": "string", "description": "Alias for the table" }
          }
        },
        "join": {
          "type": "array",
          "description": "Tables to join with the main table",
          "items": {
            "type": "object",
            "properties": {
              "table": {
                "type": "string",
                "description": "Table name (case sensitive)"
              },
              "as": { "type": "string", "description": "Alias for the table" },
              "type": {
                "enum": ["inner", "left", "right", "full"],
                "description": "Type of join"
              },
              "on": {
                "type": "array",
                "description": "Join conditions, implicitly combined with AND",
                "items": {
                  "type": "object",
                  "properties": {
                    "left": {
                      "type": "string",
                      "description": "Column from the main table"
                    },
                    "right": {
                      "type": "string",
                      "description": "Column from the joined table"
                    }
                  }
                }
              }
            }
          }
        },
        "select": {
          "type": "array",
          "description": "Select columns with optional aliases and aggregation/window functions",
          "items": {
            "type": "object",
            "required": ["column"],
            "properties": {
              "column": {
                "type": "string",
                "description": "Column name to select (prefixed with table alias)"
              },
              "as": { "type": "string", "description": "Alias for the column" },
              "function": {
                "enum": [
                  "count",
                  "sum",
                  "avg",
                  "min",
                  "max",
                  "row_number",
                  "rank",
                  "dense_rank",
                  "lag",
                  "lead",
                  "first_value",
                  "last_value",
                  "nth_value"
                ],
                "description": "Aggregation or window function to apply"
              },
              "expression": {
                "type": "string",
                "description": "SQL expression for a calculated column (can reference earlier aliases; multi-layer CTEs resolve dependencies)"
              },
              "filter": {
                "type": "object",
                "description": "Filter conditions for the aggregation function (PostgreSQL FILTER)"
              },
              "window": {
                "type": "object",
                "description": "OVER clause for window functions",
                "properties": {
                  "partitionBy": {
                    "type": "array",
                    "items": { "type": "string" }
                  },
                  "orderBy": { "type": "array" }
                }
              }
            }
          }
        },
        "where": {
          "type": "object",
          "description": "Filter clause with logical operators (column/operator/value or expression, combined via and/or/not)",
          "properties": {
            "column": { "type": "string" },
            "expression": { "type": "string" },
            "operator": { "enum": ["=", ">", ">=", "<", "<=", "!=", "in"] },
            "value": { "type": "string" },
            "and": { "type": "array" },
            "or": { "type": "array" },
            "not": { "type": "boolean" }
          }
        },
        "groupBy": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Group by columns (prefixed with table alias)"
        },
        "orderBy": {
          "type": "array",
          "description": "Order by columns",
          "items": {
            "type": "object",
            "properties": {
              "column": { "type": "string" },
              "direction": { "enum": ["asc", "desc"] }
            }
          }
        },
        "limit": { "type": "number" },
        "offset": { "type": "number" }
      }
    },
    "calculatedColumns": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "type", "expression"],
        "properties": {
          "name": { "type": "string" },
          "type": {
            "enum": [
              "string",
              "number",
              "boolean",
              "date",
              "time",
              "datetime",
              "object"
            ]
          },
          "description": { "type": "string" },
          "enum": { "type": "array", "items": { "type": "string" } },
          "expression": {
            "type": "string",
            "description": "Computed-column JS expression"
          },
          "schema": {
            "type": "object",
            "description": "JSON Schema for object columns"
          }
        }
      }
    }
  }
}
```

## Example

`artifacts/views/OrdersOverview.json` — orders joined to customers, one row per order:

```json
{
  "name": "OrdersOverview",
  "description": "Orders with customer name and computed total",
  "query": {
    "from": { "table": "Order", "as": "o" },
    "join": [
      {
        "table": "Customer",
        "as": "c",
        "type": "left",
        "on": [{ "left": "o.customerId", "right": "c.id" }]
      }
    ],
    "select": [
      { "column": "o.id", "as": "orderId" },
      { "column": "c.name", "as": "customerName" },
      { "column": "o.amount", "function": "sum", "as": "total" }
    ],
    "where": { "column": "o.status", "operator": "=", "value": "open" },
    "groupBy": ["o.id", "c.name"],
    "orderBy": [{ "column": "total", "direction": "desc" }],
    "limit": 100
  },
  "calculatedColumns": [
    {
      "name": "totalWithTax",
      "type": "number",
      "expression": "item.total * 1.1",
      "description": "Order total including 10% tax"
    }
  ]
}
```

The base table lives under `query.from.table` (with an optional `as` alias). Joined tables are referenced by alias in `select`, `where`, `groupBy`, and `orderBy`.

**Calculated columns are output-only.** A `calculatedColumns` entry (or a table column with an `expression`) is computed in JavaScript per row _after_ the query runs, so SQL never sees it. It can only be read from the table or view that defines it:

- A view's `query` must not select, filter, sort, group, aggregate or join on a calculated column of the table or view it reads from — that read fails with `CALCULATED_COLUMN_NOT_QUERYABLE`. Select the stored columns the expression uses and define the calculation on this view instead (in `calculatedColumns`, or as a SQL `expression` in `select`).
- A query that joins a table may not select that table's calculated columns — only the queried table's or view's own calculated columns are computed. Select the stored columns instead.
- Nothing may `where`, `orderBy`, `groupBy`, aggregate or join on a calculated column. When the app needs to filter or sort by a derived value, make it a SQL `expression` in the view's `select` (SQL sees it), not a calculated column.

## Update & delete

- **Update:** write the artifact with the **same name** as an existing view → updated in place (editViews): query, description, and calculated columns (added/updated/removed to match).
- **legacyName:** read-only, seeded when a live view's previous title differed from its name. Never author or change it. Preserve it if present — it keeps backward compatibility for existing apps, and the user may refer to the view by this name as well.
- **Delete:** remove the artifact file from `artifacts/views/` to delete the view on sync.

After any view change, run **`pnpm gen:types`**.
