/**
 * AUTO-GENERATED — do not edit by hand.
 * Bundled from apps/compiler/src/modules/code-gen via apps/compiler/scripts/bundle-gen-types.mjs
 * Regenerate: pnpm --filter @blockscom/compiler run bundle:gen-types
 */

// src/modules/code-gen/schema-based-types-generator.ts
var IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function propertyKey(name) {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}
var SchemaBasedTypesGenerator = class _SchemaBasedTypesGenerator {
  constructor(options) {
    this.generatedTypes = /* @__PURE__ */ new Map();
    this.visitedRefs = /* @__PURE__ */ new Set();
    this.options = options;
    this.mainTypeName = "";
  }
  static convert(schema, options = { skipReadOnlyProps: false }) {
    return new _SchemaBasedTypesGenerator(options).convertSchema(schema);
  }
  static formatTypeName(name) {
    return new _SchemaBasedTypesGenerator({}).formatTypeName(name);
  }
  /**
   * The name under which `convert` declares a schema's main type.
   * Object-shaped schemas become `export interface I<Name>`; arrays, enums,
   * unions, and primitives become `export type <Name>` (no `I` prefix).
   * Schemas whose root `processType` declares nothing — a `$ref` root (only
   * the definitions are emitted), `type: 'null'`, or an array with
   * tuple/boolean `items` — resolve to `any`. References emitted elsewhere
   * must use this, or they point at a name that was never declared.
   */
  static declaredTypeName(schema) {
    return _SchemaBasedTypesGenerator.referenceNameFor(
      _SchemaBasedTypesGenerator.formatTypeName(schema.title || "Root"),
      schema
    );
  }
  /**
   * The reference matching what `processType` declares for `schema` under the
   * (already formatted) `name`: `I<name>` for object shapes, `name` for the
   * alias forms, `any` where `processType` declares nothing.
   */
  static referenceNameFor(name, schema) {
    if (schema.$ref || schema.type === "null") {
      return "any";
    }
    if (_SchemaBasedTypesGenerator.isObjectShaped(schema)) {
      return `I${name}`;
    }
    if (schema.type === "array" && schema.items && (typeof schema.items === "boolean" || Array.isArray(schema.items))) {
      return "any";
    }
    return name;
  }
  /** The dispatch test for `processObjectType` — single source, shared with `processType`. */
  static isObjectShaped(schema) {
    return schema.type === "object" || schema.properties !== void 0 && Object.keys(schema.properties).length > 0;
  }
  convertSchema(schema) {
    this.visitedRefs = /* @__PURE__ */ new Set();
    this.generatedTypes.clear();
    this.rootDefinitions = schema.definitions;
    if (schema.definitions) {
      for (const [name, definition] of Object.entries(schema.definitions)) {
        this.processDefinition(name, definition);
      }
    }
    const mainTypeName = schema.title || "Root";
    this.mainTypeName = this.formatTypeName(mainTypeName);
    this.processType(this.mainTypeName, schema);
    let output = "";
    for (const [, code] of this.generatedTypes) {
      output += `${code}

`;
    }
    return output;
  }
  processDefinition(name, definition) {
    if (typeof definition === "boolean" || Array.isArray(definition)) {
      return;
    }
    this.processType(name, definition);
  }
  processType(name, schema) {
    if (schema.$ref) {
      const refName = this.getRefName(schema.$ref);
      if (!this.visitedRefs.has(refName)) {
        this.visitedRefs.add(refName);
      }
      return;
    }
    if (schema.type === "null") {
      return;
    }
    const typeName = this.formatTypeName(name);
    if (_SchemaBasedTypesGenerator.isObjectShaped(schema)) {
      this.processObjectType(typeName, schema);
    } else if (schema.type === "array" && schema.items) {
      this.processArrayType(typeName, schema);
    } else if (schema.enum && schema.enum.length > 0) {
      this.processEnumType(typeName, schema);
    } else if (schema.oneOf || schema.anyOf || schema.allOf) {
      this.processCompositeType(typeName, schema);
    } else {
      this.generateSimpleType(typeName, schema);
    }
  }
  processObjectType(name, schema) {
    if (this.generatedTypes.has(name)) {
      return;
    }
    let typeCode = `
/**
* ${schema.description}
*/
export interface I${name} {
`;
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (typeof propSchema === "boolean" || Array.isArray(propSchema)) {
          continue;
        }
        if (propSchema.readOnly && this.options.skipReadOnlyProps) {
          continue;
        }
        const propType = this.getTypeForProperty(propName, propSchema);
        if (propType === "null") {
          continue;
        }
        const isRequired = schema.required?.includes(propName) ?? false;
        const optionalMark = isRequired ? "" : "?";
        const textPropName = propName || propSchema.title;
        if (textPropName?.includes(".")) {
          this.options.onWarn?.(
            `Property name ${textPropName} contains a dot, which is not allowed. skipping...`
          );
          continue;
        }
        let propDefault;
        if (propSchema.default) {
          if (typeof propSchema.default === "string") {
            propDefault = `(default: "${propSchema.default}")`;
          } else {
            propDefault = `(default: ${propSchema.default})`;
          }
        }
        if (propSchema.description || propDefault) {
          typeCode += `  /** ${propSchema.description || ""} ${propDefault || ""} */
`;
        }
        typeCode += `  ${propertyKey(textPropName ?? "")}${optionalMark}: ${propType};
`;
      }
    }
    typeCode += "}\n";
    this.generatedTypes.set(name, typeCode);
  }
  processArrayType(name, schema) {
    if (this.generatedTypes.has(name)) {
      return;
    }
    const itemsSchema = schema.items;
    if (!itemsSchema || typeof itemsSchema === "boolean" || Array.isArray(itemsSchema)) {
      return;
    }
    const itemType = this.getTypeForProperty(`${name}Item`, itemsSchema);
    const typeCode = `export type ${name} = ${itemType}[];`;
    this.generatedTypes.set(name, typeCode);
  }
  processEnumType(name, schema) {
    if (this.generatedTypes.has(name) || !schema.enum?.length) {
      return;
    }
    let typeCode;
    if (schema.enum.every((item) => typeof item === "string")) {
      typeCode = `export type ${name} = ${schema.enum.map((value) => JSON.stringify(value)).join(" | ")};`;
    } else {
      const unionValues = schema.enum.map((value) => {
        if (typeof value === "string") {
          return JSON.stringify(value);
        }
        if (value === null) {
          return "null";
        }
        return String(value);
      }).join(" | ");
      typeCode = `export type ${name} = ${unionValues};`;
    }
    this.generatedTypes.set(name, typeCode);
  }
  processCompositeType(name, schema) {
    if (this.generatedTypes.has(name)) {
      return;
    }
    let compositeSchema;
    let operator = "|";
    if (schema.oneOf) {
      compositeSchema = schema.oneOf.filter(
        (s) => typeof s !== "boolean" && !Array.isArray(s)
      );
    } else if (schema.anyOf) {
      compositeSchema = schema.anyOf.filter(
        (s) => typeof s !== "boolean" && !Array.isArray(s)
      );
    } else if (schema.allOf) {
      compositeSchema = schema.allOf.filter(
        (s) => typeof s !== "boolean" && !Array.isArray(s)
      );
      operator = "&";
    } else {
      return;
    }
    const typeNames = [];
    for (let i = 0; i < compositeSchema.length; i++) {
      const subSchema = compositeSchema[i];
      const subName = `${name}Item${i + 1}`;
      if (subSchema.$ref) {
        typeNames.push(this.refReferenceName(subSchema.$ref));
      } else if (subSchema.type === "null") {
        typeNames.push("null");
      } else {
        this.processType(subName, subSchema);
        typeNames.push(
          _SchemaBasedTypesGenerator.referenceNameFor(
            this.formatTypeName(subName),
            subSchema
          )
        );
      }
    }
    const typeCode = `export type ${name} = ${typeNames.join(` ${operator} `)};`;
    this.generatedTypes.set(name, typeCode);
  }
  generateSimpleType(name, schema) {
    if (this.generatedTypes.has(name)) {
      return;
    }
    let tsType;
    switch (schema.type) {
      case "string":
        tsType = "string";
        break;
      case "integer":
      case "number":
        tsType = "number";
        break;
      case "boolean":
        tsType = "boolean";
        break;
      case "null":
        tsType = "null";
        break;
      default:
        tsType = "any";
    }
    this.generatedTypes.set(name, `export type ${name} = ${tsType};`);
  }
  getTypeForProperty(name, schema) {
    if (!schema) {
      return "any";
    }
    if (schema.$ref) {
      return this.refReferenceName(schema.$ref);
    }
    if (name !== this.mainTypeName) {
      name = `${this.mainTypeName}${this.formatTypeName(name)}`;
    }
    if (schema.oneOf) {
      return schema.oneOf.filter(
        (s) => typeof s !== "boolean" && !Array.isArray(s)
      ).map((v) => this.getTypeForProperty(`${name}Item`, v)).join(" | ");
    }
    if (schema.anyOf) {
      return schema.anyOf.filter(
        (s) => typeof s !== "boolean" && !Array.isArray(s)
      ).map((v) => this.getTypeForProperty(`${name}Item`, v)).join(" | ");
    }
    if (schema.allOf) {
      return schema.allOf.filter(
        (s) => typeof s !== "boolean" && !Array.isArray(s)
      ).map((v) => this.getTypeForProperty(`${name}Item`, v)).join(" & ");
    }
    if (schema.enum?.length) {
      const subName = this.formatTypeName(`${name}Enum`);
      this.processEnumType(subName, schema);
      return subName;
    }
    if (schema.type === "array") {
      if (schema.items && typeof schema.items !== "boolean" && !Array.isArray(schema.items)) {
        return `${this.getTypeForProperty(`${name}Item`, schema.items)}[]`;
      }
      return "any[]";
    }
    if (schema.type === "object") {
      const subName = this.formatTypeName(`${name}Object`);
      this.processObjectType(subName, schema);
      return `I${subName}`;
    }
    switch (schema.type) {
      case "string":
        return "string";
      case "integer":
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      default:
        return "any";
    }
  }
  getRefName(ref) {
    const parts = ref.split("/");
    return this.formatTypeName(parts[parts.length - 1]);
  }
  /**
   * Reference for a `$ref`: definitions are declared by `convertSchema` under
   * their own name with the same object-shaped `I` prefix rule, so the bare
   * ref name is dangling for object definitions. Unresolvable refs get `any` —
   * nothing is declared for them.
   */
  refReferenceName(ref) {
    const rawName = ref.split("/").pop() ?? "";
    const definition = this.rootDefinitions?.[rawName];
    if (!definition || typeof definition === "boolean" || Array.isArray(definition)) {
      return "any";
    }
    return _SchemaBasedTypesGenerator.referenceNameFor(
      this.formatTypeName(rawName),
      definition
    );
  }
  formatTypeName(name) {
    return name.replace(/[^\w\s-]/g, "").split(/[-\s]+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  }
};

// src/modules/code-gen/artifact-reserved-columns.ts
var RESERVED_ARTIFACT_COLUMN_NAMES = [
  "id",
  "userId",
  "accountId",
  "appId",
  "tableId",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "updatedByAgentId",
  "createdByAgentId",
  "createdByAgentThreadId",
  "deletedAt",
  "deletedBy",
  "isDeleted",
  "metadata",
  "tenantId"
];
function normalizeColumnName(name) {
  return name.toLowerCase().replaceAll("_", "").replace("-", "");
}
var RESERVED_COLUMN_NAME_SET = new Set(
  RESERVED_ARTIFACT_COLUMN_NAMES.map(normalizeColumnName)
);
function isReservedArtifactColumnName(name) {
  return RESERVED_COLUMN_NAME_SET.has(normalizeColumnName(name));
}

// src/modules/code-gen/artifact-to-describe-core.ts
import fs from "fs/promises";
import path from "path";

// src/modules/code-gen/codegen-constants.ts
var ARTIFACTS_DIR_NAME = "artifacts";
var ARTIFACT_SUBDIRS = {
  tables: "tables",
  actions: "actions",
  workflows: "workflows",
  views: "views",
  roles: "roles",
  agents: "agents",
  agentChats: "agent-chats",
  skills: "skills"
};
var APP_FILENAME = "app.json";
var SRC_DIR_NAME = "src";
var PAGES_DIR_NAME = "pages";
var PAGE_FILE_EXTENSION = ".tsx";
var ARTIFACT_PLACEHOLDER_PREFIX = "artifact:";
var CHAT_COMPONENTS_DIR_NAME = "chat-components";
var CHAT_COMPONENT_META_FILENAME = "meta.json";
var PAGE_CONST_PATTERN = /export const (\w+Page)\s*=\s*(?:\{[\s\S]*?\}\s*as const|"[^"]*");/g;

// src/modules/code-gen/artifact-to-describe-core.ts
function artifactActionPlaceholderId(name) {
  return `${ARTIFACT_PLACEHOLDER_PREFIX}action:${name.replace(/\s+/g, "")}`;
}
function columnTypeToJsonSchema(col) {
  const desc = col.description ?? "";
  const base = { description: desc };
  let schema;
  switch (col.type) {
    case "string": {
      const enumValues = col.enum ?? [];
      schema = {
        type: "string",
        enum: enumValues.length ? enumValues : void 0,
        ...base
      };
      break;
    }
    case "number":
      schema = { type: "number", ...base };
      break;
    case "boolean":
      schema = { type: "boolean", ...base };
      break;
    // JSON Schema has no temporal types: the column type survives only in
    // `format`, so emit the exact one (matches data-service's describe —
    // getSchemaForColumn — and the seed-artifacts reverse mapping).
    case "date":
      schema = { type: "string", format: "date", ...base };
      break;
    case "time":
      schema = { type: "string", format: "time", ...base };
      break;
    case "datetime":
      schema = { type: "string", format: "date-time", ...base };
      break;
    case "object":
      schema = col.schema ? { ...col.schema, ...base } : { type: "object", additionalProperties: true, ...base };
      break;
    default:
      schema = { type: "string", ...base };
  }
  if (isReservedArtifactColumnName(col.name)) {
    schema.readOnly = true;
  }
  return schema;
}
function artifactTableToTableDescribe(table) {
  const title = table.name.replace(/\s+/g, "");
  const properties = {};
  for (const col of table.columns) {
    properties[col.name] = columnTypeToJsonSchema(col);
  }
  return {
    schema: {
      $id: `${ARTIFACT_PLACEHOLDER_PREFIX}table:${title}`,
      title,
      description: table.description,
      type: "object",
      properties,
      ...table.legacyName ? { legacyName: table.legacyName } : {}
    }
  };
}
function resolveActionInputSchema(action) {
  if (action.inputSchema) {
    return action.inputSchema;
  }
  return { type: "object", properties: {} };
}
function resolveActionOutputSchema(action) {
  if (action.type === "code" && action.outputSchema) {
    return action.outputSchema;
  }
  if (action.output && typeof action.output === "object" && "type" in action.output) {
    return action.output;
  }
  return { type: "object", properties: {} };
}
function artifactActionToActionDescribe(action) {
  const name = action.name.replace(/\s+/g, "");
  const entry = {
    actionTypeId: artifactActionPlaceholderId(action.name),
    actionTypeName: name,
    actionTypeDescription: action.description ?? name,
    actionSetId: "app",
    isCurrentAppAction: true,
    input: resolveActionInputSchema(action),
    output: resolveActionOutputSchema(action)
  };
  if (action.type === "dag") {
    entry.actionNodes = action.actionNodes ?? [];
    entry.conditionNodes = action.conditionNodes;
    entry.mergeNodes = action.mergeNodes;
    entry.edges = action.edges;
    if (typeof action.output === "string") {
      entry.outputNode = action.output;
    }
  }
  return entry;
}
function artifactViewToViewDescribe(view) {
  const title = view.name.replace(/\s+/g, "");
  const properties = {};
  for (const col of view.calculatedColumns) {
    const schema = col.type === "string" ? { type: "string", description: col.description } : col.type === "number" ? { type: "number", description: col.description } : col.type === "boolean" ? { type: "boolean", description: col.description } : col.type === "date" || col.type === "time" || col.type === "datetime" ? {
      type: "string",
      format: "date-time",
      description: col.description
    } : { type: "string", description: col.description };
    if (isReservedArtifactColumnName(col.name)) {
      schema.readOnly = true;
    }
    properties[col.name] = schema;
  }
  return {
    schema: {
      $id: `${ARTIFACT_PLACEHOLDER_PREFIX}view:${title}`,
      title,
      type: "object",
      properties,
      ...view.legacyName ? { legacyName: view.legacyName } : {}
    }
  };
}
function normalizeAgentRef(value) {
  return value.replace(/\s+/g, "").toLowerCase();
}
function artifactAgentPlaceholderId(key) {
  return `${ARTIFACT_PLACEHOLDER_PREFIX}agent:${key}`;
}
function artifactAgentChatPlaceholderId(key) {
  return `${ARTIFACT_PLACEHOLDER_PREFIX}agentChat:${key}`;
}
function artifactAgentToAgentDescribe(key, agent) {
  return {
    agentId: artifactAgentPlaceholderId(key),
    agentName: agent.name,
    title: agent.title,
    jobTitle: agent.jobTitle ?? "",
    harness: agent.harness ?? "deep_agent",
    instructions: agent.instructions ?? "",
    memoryEnabled: agent.memoryEnabled,
    photoUrl: agent.photoUrl,
    avatarUrl: agent.avatarUrl,
    tools: (agent.tools ?? []).map((tool) => ({
      actionTypeId: tool.actionTypeId
    }))
  };
}
function resolveAgentIdForArtifactChat(chat, manifest) {
  const agents = manifest.agents ?? {};
  if (chat.agentId) {
    if (chat.agentId.startsWith(ARTIFACT_PLACEHOLDER_PREFIX)) {
      return chat.agentId;
    }
    if (agents[chat.agentId]) {
      return artifactAgentPlaceholderId(chat.agentId);
    }
    const byName = Object.entries(agents).find(
      ([, agent]) => normalizeAgentRef(agent.name) === normalizeAgentRef(chat.agentId)
    );
    if (byName) {
      return artifactAgentPlaceholderId(byName[0]);
    }
    return chat.agentId;
  }
  const entries = Object.entries(agents);
  if (entries.length === 1) {
    return artifactAgentPlaceholderId(entries[0][0]);
  }
  return void 0;
}
function artifactAgentChatToAgentChatDescribe(key, chat, manifest) {
  return {
    agentChatId: artifactAgentChatPlaceholderId(key),
    agentChatName: chat.name,
    agentId: resolveAgentIdForArtifactChat(chat, manifest),
    isAdmin: chat.isAdmin ?? false,
    allowRunningActions: chat.allowRunningActions ?? false
  };
}
function buildDescribeFromArtifacts(manifest) {
  const tables = {};
  for (const [key, table] of Object.entries(manifest.tables ?? {})) {
    tables[key] = artifactTableToTableDescribe(table);
  }
  const views = {};
  for (const [key, view] of Object.entries(manifest.views ?? {})) {
    views[key] = artifactViewToViewDescribe(view);
  }
  const actions = {};
  for (const [key, action] of Object.entries(manifest.actions ?? {})) {
    actions[key] = artifactActionToActionDescribe(action);
  }
  const agents = {};
  for (const [key, agent] of Object.entries(manifest.agents ?? {})) {
    agents[key] = artifactAgentToAgentDescribe(key, agent);
  }
  const agentChats = {};
  for (const [key, chat] of Object.entries(manifest.agentChats ?? {})) {
    agentChats[key] = artifactAgentChatToAgentChatDescribe(key, chat, manifest);
  }
  return { tables, views, actions, agents, agentChats };
}
async function readChatComponentsFromDirectory(projectRoot) {
  const chatComponentsDir = path.join(projectRoot, CHAT_COMPONENTS_DIR_NAME);
  let entries;
  try {
    entries = await fs.readdir(chatComponentsDir, { withFileTypes: true });
  } catch {
    return {};
  }
  const chatComponents = {};
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const metaPath = path.join(
      chatComponentsDir,
      entry.name,
      CHAT_COMPONENT_META_FILENAME
    );
    let name = entry.name;
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
      if (typeof meta.name === "string" && meta.name.trim()) {
        name = meta.name.trim();
      }
    } catch {
    }
    chatComponents[name] = {
      chatComponentId: `${ARTIFACT_PLACEHOLDER_PREFIX}chatComponent:${name.replace(/\s+/g, "")}`
      // resolved to real block ids post-sync
    };
  }
  return chatComponents;
}
async function readPagesFromDirectory(projectRoot) {
  const pagesDir = path.join(projectRoot, SRC_DIR_NAME, PAGES_DIR_NAME);
  const walk = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const files2 = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files2.push(...await walk(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(PAGE_FILE_EXTENSION)) {
        files2.push(fullPath);
      }
    }
    return files2;
  };
  const files = (await walk(pagesDir)).sort();
  const pages = {};
  for (const file of files) {
    const relFromPages = path.relative(pagesDir, file).split(path.sep).join("/").replace(/\.tsx$/, "");
    pages[relFromPages] = { id: relFromPages, name: relFromPages };
  }
  return pages;
}
async function readArtifactsFromDirectory(compilerDir) {
  const artifactsDir = path.join(compilerDir, ARTIFACTS_DIR_NAME);
  const manifest = {};
  try {
    await fs.access(artifactsDir);
  } catch {
    return manifest;
  }
  const readJsonDir = async (subdir) => {
    const dir = path.join(artifactsDir, subdir);
    try {
      await fs.access(dir);
    } catch {
      return {};
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out = {};
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json")) {
        continue;
      }
      const key = e.name.slice(0, -5);
      const content = await fs.readFile(path.join(dir, e.name), "utf-8");
      try {
        out[key] = JSON.parse(content);
      } catch (err) {
        console.warn(
          `Skipping invalid artifact JSON in ${subdir}/${e.name}: ${err.message}`
        );
      }
    }
    return out;
  };
  manifest.tables = await readJsonDir(ARTIFACT_SUBDIRS.tables);
  manifest.actions = await readJsonDir(
    ARTIFACT_SUBDIRS.actions
  );
  manifest.workflows = await readJsonDir(ARTIFACT_SUBDIRS.workflows);
  manifest.views = await readJsonDir(ARTIFACT_SUBDIRS.views);
  manifest.roles = await readJsonDir(ARTIFACT_SUBDIRS.roles);
  manifest.agents = await readJsonDir(ARTIFACT_SUBDIRS.agents);
  manifest.agentChats = await readJsonDir(
    ARTIFACT_SUBDIRS.agentChats
  );
  manifest.skills = await readJsonDir(ARTIFACT_SUBDIRS.skills);
  const appPath = path.join(artifactsDir, APP_FILENAME);
  try {
    manifest.app = JSON.parse(await fs.readFile(appPath, "utf-8"));
  } catch {
  }
  return manifest;
}

// src/modules/code-gen/generate-product-types.ts
import fs2 from "fs/promises";
import path2 from "path";
var GENERATED_EXPORT_PATTERN = /^export (interface|type|const) ([A-Za-z_][\w]*)/gm;
function aliasGeneratedExportName(name, actualEntity, legacyEntity) {
  const actualInterface = `I${actualEntity}`;
  const legacyInterface = `I${legacyEntity}`;
  if (name === actualEntity) {
    return legacyEntity;
  }
  if (name === actualInterface) {
    return legacyInterface;
  }
  if (name.startsWith(actualInterface)) {
    return `${legacyInterface}${name.slice(actualInterface.length)}`;
  }
  if (name.startsWith(actualEntity)) {
    return `${legacyEntity}${name.slice(actualEntity.length)}`;
  }
  return void 0;
}
function collectExportNames(code) {
  const names = /* @__PURE__ */ new Set();
  const pattern = new RegExp(GENERATED_EXPORT_PATTERN.source, "gm");
  let match;
  while ((match = pattern.exec(code)) !== null) {
    names.add(match[2]);
  }
  return names;
}
function emitLegacyTypeAliases(code, actualEntity, legacyName, reserved) {
  const legacyEntity = SchemaBasedTypesGenerator.formatTypeName(
    `${legacyName}Entity`
  );
  if (!legacyEntity || legacyEntity === actualEntity) {
    return "";
  }
  const aliases = [];
  const pattern = new RegExp(GENERATED_EXPORT_PATTERN.source, "gm");
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const kind = match[1];
    const name = match[2];
    const aliased = aliasGeneratedExportName(name, actualEntity, legacyEntity);
    if (!aliased || aliased === name || reserved.has(aliased)) {
      continue;
    }
    reserved.add(aliased);
    if (kind === "const") {
      aliases.push(`export const ${aliased} = ${name};`);
    } else {
      aliases.push(`export type ${aliased} = ${name};`);
    }
  }
  return aliases.length ? `
${aliases.join("\n")}
` : "";
}
function extractPageConstBlocks(source) {
  if (!source) {
    return [];
  }
  const blocks = [];
  const pattern = new RegExp(PAGE_CONST_PATTERN.source, "g");
  let match;
  while ((match = pattern.exec(source)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}
function generateCodeFromDescribe(appDescribe, options = {}) {
  const types = [];
  const tableDescribes = Object.values(appDescribe.tables || {});
  const viewDescribes = Object.values(appDescribe.views || {});
  const schemas = [...tableDescribes, ...viewDescribes].map(
    (describe) => describe.schema
  );
  const legacyAliasRequests = [];
  for (const tableDescribe of schemas) {
    if (!tableDescribe.title) {
      continue;
    }
    const tableBlockId = tableDescribe.title;
    const legacyName = tableDescribe.legacyName;
    tableDescribe.title = `${tableDescribe.title}Entity`;
    let code = SchemaBasedTypesGenerator.convert(tableDescribe, {
      skipReadOnlyProps: true
    });
    const instanceTypeName = SchemaBasedTypesGenerator.formatTypeName(
      tableDescribe.title
    );
    code += `
export const ${instanceTypeName} = {
    tableBlockId: "${tableBlockId}",
    instanceType: {} as ${SchemaBasedTypesGenerator.declaredTypeName(tableDescribe)}
} as const;
`;
    types.push(code);
    if (legacyName) {
      legacyAliasRequests.push({ code, instanceTypeName, legacyName });
    }
  }
  if (options.pageConstBlocks?.length) {
    for (const pageConst of options.pageConstBlocks) {
      types.push(`
${pageConst}
`);
    }
  } else {
    for (const key of Object.keys(appDescribe.pages || {})) {
      const pageConstName = SchemaBasedTypesGenerator.formatTypeName(
        `${key}Page`
      );
      types.push(`export const ${pageConstName} = ${JSON.stringify(key)};
`);
    }
  }
  const actionsDescribes = Object.values(appDescribe.actions || {});
  for (const actionDescribe of actionsDescribes) {
    if (!actionDescribe.actionTypeName) {
      continue;
    }
    const actionTypeName = actionDescribe.actionTypeName;
    actionDescribe.actionTypeName = `${actionDescribe.actionTypeName}Action`;
    const wfInputDesc = actionDescribe.input || {
      type: "object",
      properties: {}
    };
    const wfOutputDesc = actionDescribe.output || {
      type: "object",
      properties: {}
    };
    wfInputDesc.title = `${actionDescribe.actionTypeName}Input`;
    types.push(SchemaBasedTypesGenerator.convert(wfInputDesc));
    wfOutputDesc.title = `${actionDescribe.actionTypeName}Output`;
    types.push(SchemaBasedTypesGenerator.convert(wfOutputDesc));
    const inputType = SchemaBasedTypesGenerator.declaredTypeName(wfInputDesc);
    let outputType = SchemaBasedTypesGenerator.declaredTypeName(wfOutputDesc);
    if (wfOutputDesc.type == "object" && (!wfOutputDesc.properties || Object.keys(wfOutputDesc.properties).length == 0)) {
      outputType = "any";
    }
    const actionBlockId = actionTypeName.replace(/\s+/g, "");
    const toolSetId = actionDescribe.actionTypeId.split("&")[1] || void 0;
    const toolId = actionDescribe.actionTypeId.split("&")[2] || void 0;
    types.push(`
/**
* ${actionDescribe.actionTypeName}
* ${actionDescribe.actionTypeDescription}
*/
export const ${SchemaBasedTypesGenerator.formatTypeName(actionDescribe.actionTypeName)} = {
  actionBlockId: "${actionBlockId}",
  ${toolSetId ? `toolSetId: "${toolSetId}",` : ""}
  ${toolId ? `toolId: "${toolId}",` : ""}
  inputInstanceType: {} as ${inputType},
  outputInstanceType: {} as ${outputType},
} as const;
`);
  }
  const agentDescribes = Object.entries(appDescribe.agents || {});
  const agentIdsToAgentDescribes = /* @__PURE__ */ new Map();
  for (const [key, agentDescribe] of agentDescribes) {
    agentIdsToAgentDescribes.set(agentDescribe.agentId, agentDescribe);
    const title = `${key}Agent`;
    const agentBlockId = agentDescribe.agentName;
    const agentConstName = SchemaBasedTypesGenerator.formatTypeName(title);
    types.push(`
export const ${agentConstName} = {
        id: "${agentBlockId}",
        name: ${JSON.stringify(agentDescribe.agentName)},
        title: ${agentDescribe.title ? JSON.stringify(agentDescribe.title) : "undefined"},
        jobTitle: ${JSON.stringify(agentDescribe.jobTitle)},
        photoUrl: ${agentDescribe.photoUrl ? JSON.stringify(agentDescribe.photoUrl) : "undefined"},
        avatarUrl: ${agentDescribe.avatarUrl ? JSON.stringify(agentDescribe.avatarUrl) : "undefined"},
      } as const;
`);
  }
  const agentChatDescribes = Object.entries(appDescribe.agentChats || {});
  const componentIds = Object.values(appDescribe.chatComponents || {}).map(
    (component) => component.chatComponentId
  );
  for (const [key, agentChatDescribe] of agentChatDescribes) {
    if (!agentChatDescribe.agentId) {
      continue;
    }
    const agentHarness = agentIdsToAgentDescribes.get(
      agentChatDescribe.agentId
    )?.harness;
    const agentName = Object.values(appDescribe.agents || {}).find(
      (agent) => agent.agentName === agentChatDescribe.agentId || agent.agentId === agentChatDescribe.agentId
    )?.agentName;
    const title = `${key}AgentChat`;
    const agentChatBlockId = agentChatDescribe.agentChatName;
    const agentBlockId = agentName;
    types.push(`
export const ${SchemaBasedTypesGenerator.formatTypeName(title)} = {
        agentChatId: "${agentChatBlockId}",
        agentId: ${agentBlockId ? `"${agentBlockId}"` : "undefined"},
        agentHarness: ${agentHarness ? `"${agentHarness}"` : "undefined"},
        componentIds: ${JSON.stringify(componentIds)} as string[],
        isAdmin: ${agentChatDescribe.isAdmin === true},
      } as const;
`);
  }
  if (legacyAliasRequests.length) {
    const reserved = collectExportNames(types.join("\n"));
    for (const request of legacyAliasRequests) {
      const aliases = emitLegacyTypeAliases(
        request.code,
        request.instanceTypeName,
        request.legacyName,
        reserved
      );
      if (aliases) {
        types.push(aliases);
      }
    }
  }
  const allCode = types.join("\n");
  return allCode.replace(
    /(\s*)([0-9][a-zA-Z0-9]*[x×][0-9]+)(\s*):/g,
    '$1"$2"$3:'
  );
}
async function generateProductTypes(projectRoot, options = {}) {
  const productTypesPath = options.productTypesPath ?? path2.join(projectRoot, "src", "product-types.ts");
  const pages = await readPagesFromDirectory(projectRoot);
  const hasPagesFromDisk = Object.keys(pages).length > 0;
  let pageConstBlocks = [];
  if (!hasPagesFromDisk && !options.skipPagePreservation) {
    try {
      const existing = await fs2.readFile(productTypesPath, "utf-8");
      pageConstBlocks = extractPageConstBlocks(existing);
    } catch {
    }
  }
  const manifest = await readArtifactsFromDirectory(projectRoot);
  const describe = buildDescribeFromArtifacts(manifest);
  describe.pages = pages;
  describe.chatComponents = await readChatComponentsFromDirectory(projectRoot);
  const code = generateCodeFromDescribe(describe, { pageConstBlocks });
  if (options.write !== false) {
    await fs2.mkdir(path2.dirname(productTypesPath), { recursive: true });
    await fs2.writeFile(productTypesPath, code, "utf-8");
  }
  return {
    code,
    manifest,
    describe,
    pageConstBlocks,
    counts: {
      tables: Object.keys(describe.tables ?? {}).length,
      views: Object.keys(describe.views ?? {}).length,
      actions: Object.keys(describe.actions ?? {}).length,
      agents: Object.keys(describe.agents ?? {}).length,
      agentChats: Object.keys(describe.agentChats ?? {}).length,
      pages: hasPagesFromDisk ? Object.keys(pages).length : pageConstBlocks.length
    }
  };
}

// ../../packages/common/src/runtime/app-mini-apps/index.ts
var MAX_MINI_APPS = 50;
var MAX_FIELD_LENGTH = 100;
var PAGE_MINI_APP_KEYS = ["entryRoute", "icon", "label"];
var AGENT_MINI_APP_KEYS = ["entryRoute", "agent"];
var OPTIONAL_MINI_APP_KEYS = ["roles"];
var MAX_MINI_APP_ROLES = 50;
var normalizeEntryRoute = (route) => route.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
var isMiniAppString = (value) => typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD_LENGTH;
var isMiniAppRoles = (value) => Array.isArray(value) && value.length > 0 && value.length <= MAX_MINI_APP_ROLES && value.every(isMiniAppString) && new Set(value).size === value.length;
function validateAppMiniApps(value) {
  if (!Array.isArray(value)) {
    return [
      {
        pointer: "miniApps",
        message: "must be an array of page items {entryRoute, icon, label} and agent items {entryRoute, agent}"
      }
    ];
  }
  if (value.length > MAX_MINI_APPS) {
    return [{ pointer: "miniApps", message: `must have at most ${MAX_MINI_APPS} items (got ${value.length})` }];
  }
  const issues = [];
  const firstIndexByRoute = /* @__PURE__ */ new Map();
  value.forEach((item, index) => {
    const pointer = `miniApps[${index}]`;
    const report = (message) => {
      issues.push({ pointer, message });
    };
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      report("must be an object \u2014 a page item {entryRoute, icon, label} or an agent item {entryRoute, agent}");
      return;
    }
    const miniApp = item;
    const isAgent = "agent" in miniApp;
    const kind = isAgent ? "agent" : "page";
    const allowedKeys = isAgent ? AGENT_MINI_APP_KEYS : PAGE_MINI_APP_KEYS;
    if (!isMiniAppString(miniApp.entryRoute)) {
      report(`entryRoute must be a non-empty string of at most ${MAX_FIELD_LENGTH} chars`);
      return;
    }
    const invalidFields = allowedKeys.filter((key) => !isMiniAppString(miniApp[key]));
    if (invalidFields.length > 0) {
      report(
        `${kind} item has a missing or invalid ${invalidFields.join(", ")} \u2014 ${kind} items need ${allowedKeys.join(", ")}, each a non-empty string of at most ${MAX_FIELD_LENGTH} chars`
      );
    }
    const extraKeys = Object.keys(miniApp).filter(
      (key) => !allowedKeys.includes(key) && !OPTIONAL_MINI_APP_KEYS.includes(key)
    );
    if (extraKeys.length > 0) {
      report(
        `unexpected ${extraKeys.join(", ")} \u2014 a ${kind} item has exactly ${allowedKeys.join(", ")}, plus optional roles`
      );
    }
    if ("roles" in miniApp && !isMiniAppRoles(miniApp.roles)) {
      report(
        `roles must be a non-empty array (at most ${MAX_MINI_APP_ROLES}) of unique role names, each a non-empty string of at most ${MAX_FIELD_LENGTH} chars \u2014 omit roles for a mini-app every user sees`
      );
    }
    const route = normalizeEntryRoute(miniApp.entryRoute);
    if (route.includes("/")) {
      report(
        `entryRoute "${miniApp.entryRoute}" must be one path segment \u2014 "/admin/reports" is an inner page of /admin, not a mini-app`
      );
    } else if (route === "") {
      if (isAgent) {
        report(`an agent never mounts at "/" \u2014 give it its own segment, e.g. "/support"`);
      } else if (value.length > 1) {
        report(
          `"/" is only for a page mini-app that is the app's ONLY mini-app \u2014 with two or more, the root is a redirect; mount this one on its own segment (e.g. "/tv") and have routes/index.tsx redirect "/" to it`
        );
      }
    }
    const firstIndex = firstIndexByRoute.get(route);
    if (firstIndex !== void 0) {
      report(
        route === "" ? `"/" is already declared by miniApps[${firstIndex}] \u2014 the root can be declared once at most` : `duplicate entryRoute "${miniApp.entryRoute}" \u2014 already declared by miniApps[${firstIndex}]`
      );
    } else {
      firstIndexByRoute.set(route, index);
    }
  });
  return issues;
}

// ../../packages/common/src/runtime/app-user-properties/index.ts
var APP_USER_PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
var APP_USER_PROPERTY_TYPES = ["text", "number", "boolean", "list"];
var MAX_PROPERTIES = 50;
var MAX_OPTIONS = 100;
var MAX_OPTION_LENGTH = 200;
var MAX_DESCRIPTION_LENGTH = 300;
var KEYS = ["name", "type", "options", "description"];
var isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function validateAppUserProperties(value) {
  if (!Array.isArray(value)) {
    return [{ pointer: "userProperties", message: "must be a list of property definitions" }];
  }
  const issues = [];
  if (value.length > MAX_PROPERTIES) {
    issues.push({ pointer: "userProperties", message: `at most ${MAX_PROPERTIES} properties` });
  }
  const seen = /* @__PURE__ */ new Set();
  value.forEach((item, index) => {
    const at = `userProperties[${index}]`;
    if (!isPlainObject(item)) {
      issues.push({ pointer: at, message: 'must be an object like { "name": "region", "type": "text" }' });
      return;
    }
    const extra = Object.keys(item).filter((key) => !KEYS.includes(key));
    if (extra.length > 0) {
      issues.push({ pointer: at, message: `unknown keys ${extra.join(", ")} \u2014 use only ${KEYS.join(", ")}` });
    }
    if (typeof item.name !== "string" || !APP_USER_PROPERTY_NAME.test(item.name)) {
      issues.push({
        pointer: `${at}.name`,
        message: "must be letters, digits and underscores (not starting with a digit), at most 64"
      });
    } else if (seen.has(item.name)) {
      issues.push({ pointer: `${at}.name`, message: `"${item.name}" is declared twice` });
    } else {
      seen.add(item.name);
    }
    if (!APP_USER_PROPERTY_TYPES.includes(item.type)) {
      issues.push({ pointer: `${at}.type`, message: `must be one of ${APP_USER_PROPERTY_TYPES.join(", ")}` });
    }
    if (item.options !== void 0) {
      const options = item.options;
      if (item.type !== "text" && item.type !== "list") {
        issues.push({ pointer: `${at}.options`, message: "only a text or list property takes options" });
      } else if (!Array.isArray(options) || options.length === 0 || options.length > MAX_OPTIONS || options.some((option) => typeof option !== "string" || !option.trim() || option.length > MAX_OPTION_LENGTH) || new Set(options).size !== options.length) {
        issues.push({
          pointer: `${at}.options`,
          message: `must be 1\u2013${MAX_OPTIONS} different non-empty strings of at most ${MAX_OPTION_LENGTH} characters`
        });
      }
    }
    if (item.description !== void 0 && (typeof item.description !== "string" || item.description.length > MAX_DESCRIPTION_LENGTH)) {
      issues.push({
        pointer: `${at}.description`,
        message: `must be a string of at most ${MAX_DESCRIPTION_LENGTH} characters`
      });
    }
  });
  return issues;
}
var USER_DATA_REFERENCE = /\{\{\s*user\.data\.([A-Za-z_][A-Za-z0-9_]*)/g;
function userDataReferences(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return [...new Set([...text.matchAll(USER_DATA_REFERENCE)].map((match) => match[1]))];
}

// ../../packages/common/src/runtime/artifacts/table-access.ts
var normalizeEntityName = (s) => s.replace(/\s+/g, "").replace(/Entity$/i, "").toLowerCase();
var ROW_POLICY_OPERATIONS = [
  "read",
  "write",
  "create",
  "update",
  "delete",
  "all"
];
var ROW_POLICY_COVERAGE = {
  all: ["read", "create", "update", "delete"],
  read: ["read"],
  write: ["create", "update", "delete"],
  create: ["create"],
  update: ["update"],
  delete: ["delete"]
};
var TENANT_SCOPES = ["tenant_owned", "cross_tenant", "system"];
var CONDITION_OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "in", "not in", "is null", "is not null", "includes"];
var HEADER_COLUMNS = /* @__PURE__ */ new Set(["id", "createdAt", "createdBy", "updatedAt", "updatedBy", "tenantId"]);
var findTable = (tables, name) => Object.values(tables).find((table) => normalizeEntityName(table.name) === normalizeEntityName(name));
var hasColumn = (table, column) => HEADER_COLUMNS.has(column) || table.columns.some((candidate) => candidate.name === column);
function conditionIssues(condition, table, tables, where) {
  if (!condition || typeof condition !== "object") {
    return [`${where}: "where" must be a condition object.`];
  }
  const issues = [];
  if (condition.column !== void 0 && typeof condition.column !== "string") {
    issues.push(`${where}: "column" must be a column name.`);
  } else if (condition.column && !hasColumn(table, condition.column)) {
    issues.push(`${where}: column "${condition.column}" is not a column of ${table.name}.`);
  }
  const needsValue = !condition.lookup && condition.operator !== "is null" && condition.operator !== "is not null";
  const value = condition.value;
  if (condition.column && needsValue && (value === void 0 || value === null || typeof value === "string" && !value.trim() || Array.isArray(value) && value.length === 0)) {
    issues.push(
      `${where}: the condition on "${condition.column}" has no value \u2014 add one (e.g. "{{user.id}}"), or use "is null" to match an empty cell.`
    );
  }
  if (condition.operator !== void 0 && !CONDITION_OPERATORS.includes(condition.operator)) {
    issues.push(`${where}: operator must be one of ${CONDITION_OPERATORS.join(", ")}.`);
  }
  const lists = ["and", "or"].filter((key) => condition[key] !== void 0);
  for (const key of lists) {
    if (!Array.isArray(condition[key])) {
      issues.push(`${where}: "${key}" must be a list of conditions.`);
    }
  }
  if (condition.lookup) {
    if (typeof condition.lookup.table !== "string" || typeof condition.lookup.column !== "string") {
      return [...issues, `${where}: a lookup needs "table" and "column" names.`];
    }
    const lookupTable = findTable(tables, condition.lookup.table);
    if (!lookupTable) {
      issues.push(`${where}: lookup table "${condition.lookup.table}" is not a table of this app.`);
    } else {
      if (!hasColumn(lookupTable, condition.lookup.column)) {
        issues.push(`${where}: lookup column "${condition.lookup.column}" is not a column of ${lookupTable.name}.`);
      }
      if (condition.lookup.where) {
        if (JSON.stringify(condition.lookup.where).includes('"lookup"')) {
          issues.push(`${where}: a lookup's "where" cannot use another lookup.`);
        }
        issues.push(...conditionIssues(condition.lookup.where, lookupTable, tables, `${where} lookup`));
      }
    }
    if (!condition.column) {
      issues.push(`${where}: a lookup needs the "column" it is compared with.`);
    }
  }
  for (const child of conditionChildren(condition)) {
    issues.push(...conditionIssues(child, table, tables, where));
  }
  return issues;
}
var conditionChildren = (condition) => [
  ...Array.isArray(condition.and) ? condition.and : [],
  ...Array.isArray(condition.or) ? condition.or : []
];
var rowPoliciesOf = (table) => Array.isArray(table.rowPolicies) ? table.rowPolicies : [];
function validateArtifactTableAccess(tables, tenantTable) {
  const issues = [];
  if (tenantTable && !findTable(tables, tenantTable)) {
    issues.push(`app.json tenantTable "${tenantTable}" is not a table of this app.`);
  }
  for (const table of Object.values(tables)) {
    const prefix = `Table ${table.name}`;
    const policies = table.rowPolicies ?? [];
    if (!Array.isArray(policies)) {
      issues.push(`${prefix}: rowPolicies must be a list.`);
      continue;
    }
    policies.forEach((policy, index) => {
      const label = `${prefix} row policy "${policy?.name ?? index + 1}"`;
      if (!policy?.name) {
        issues.push(`${label}: a policy needs a name.`);
      }
      if (!ROW_POLICY_OPERATIONS.includes(policy?.operation)) {
        issues.push(`${label}: operation must be one of ${ROW_POLICY_OPERATIONS.join(", ")}.`);
      }
      issues.push(...conditionIssues(policy?.where, table, tables, label));
    });
    const operations = policies.map((policy) => policy?.operation);
    const overlapping = operations.some(
      (operation, i) => operations.slice(i + 1).some((other) => ROW_POLICY_COVERAGE[operation]?.some((op) => ROW_POLICY_COVERAGE[other]?.includes(op)))
    );
    if (overlapping) {
      issues.push(
        `${prefix}: two row policies govern the same operation; use one policy per operation (combine conditions with "and" / "or").`
      );
    }
    if (table.columnPolicies !== void 0 && !Array.isArray(table.columnPolicies)) {
      issues.push(`${prefix}: columnPolicies must be a list.`);
    }
    for (const policy of Array.isArray(table.columnPolicies) ? table.columnPolicies : []) {
      if (policy?.operation !== void 0 && !["read", "write", "all"].includes(policy.operation)) {
        issues.push(`${prefix} column policy "${policy.name}": operation must be read, write or all.`);
      }
      if (!Array.isArray(policy?.columns)) {
        issues.push(`${prefix} column policy "${policy?.name}": "columns" must be a list of column names.`);
        continue;
      }
      for (const column of policy.columns) {
        if (!hasColumn(table, column)) {
          issues.push(`${prefix} column policy "${policy.name}": "${column}" is not a column of ${table.name}.`);
        }
      }
    }
    const tenancy = table.multiTenant;
    if (tenancy) {
      if (!TENANT_SCOPES.includes(tenancy.scope)) {
        issues.push(`${prefix}: multiTenant.scope must be one of ${TENANT_SCOPES.join(", ")}.`);
      }
      if (!tenantTable) {
        issues.push(`${prefix}: multiTenant needs app.json "tenantTable" (the table whose rows are the tenants).`);
      }
      const isTenantTable = !!tenantTable && normalizeEntityName(tenantTable) === normalizeEntityName(table.name);
      if (tenancy.scope === "tenant_owned" && !isTenantTable) {
        const reference = table.columns.find((column) => column.name === tenancy.referenceColumn);
        if (!tenancy.referenceColumn || !reference) {
          issues.push(
            `${prefix}: a tenant_owned table needs multiTenant.referenceColumn, one of its reference columns leading to ${tenantTable ?? "the tenant table"}.`
          );
        } else if (!reference.reference) {
          issues.push(`${prefix}: multiTenant.referenceColumn "${reference.name}" must be a reference column.`);
        }
      }
    }
  }
  return issues;
}
var governs = (operation, access) => ROW_POLICY_COVERAGE[operation]?.includes(access) ?? false;
var isAlwaysTrue = (where) => !!where && !where.column && !where.and && !where.or && !where.not && (where.value === true || where.value === "true");
var lookupTablesOf = (where) => where && typeof where === "object" ? [
  ...typeof where.lookup?.table === "string" ? [where.lookup.table] : [],
  ...where.lookup?.where ? lookupTablesOf(where.lookup.where) : [],
  ...conditionChildren(where).flatMap(lookupTablesOf)
] : [];
function checkArtifactTableAccess(tables, tenantTable, { roles = 0 } = {}) {
  const all = Object.values(tables);
  if (!tenantTable && roles < 2 && !all.some((table) => rowPoliciesOf(table).length)) {
    return [];
  }
  const findings = [];
  const membershipTables = new Set(
    all.flatMap(
      (table) => rowPoliciesOf(table).flatMap((policy) => lookupTablesOf(policy?.where).map(normalizeEntityName))
    )
  );
  for (const table of all) {
    if (!membershipTables.has(normalizeEntityName(table.name))) {
      continue;
    }
    const open2 = ["create", "update", "delete"].filter((access) => {
      const policy = rowPoliciesOf(table).find((candidate) => governs(candidate?.operation, access));
      return !policy || isAlwaysTrue(policy.where);
    });
    if (open2.length > 0) {
      findings.push(
        `Data access check: rules read membership from ${table.name}, but any member can ${open2.join(" / ")} its rows \u2014 so anyone can give themselves access. Restrict those operations (e.g. to an Admin role or the group's owners).`
      );
    }
  }
  for (const table of all) {
    for (const policy of rowPoliciesOf(table)) {
      if (isAlwaysTrue(policy?.where) && policy.operation !== "create") {
        findings.push(
          `Data access check: ${table.name} policy "${policy.name}" lets every member ${policy.operation === "all" ? "read and change" : policy.operation} every row. If that's intended for shared data, remove the policy; otherwise give it a condition.`
        );
      }
    }
  }
  const isTenantTable = (table) => !!tenantTable && normalizeEntityName(tenantTable) === normalizeEntityName(table.name);
  const open = all.filter(
    (table) => !rowPoliciesOf(table).length && // Any declared scope is an answered question: tenant-owned and system tables are scoped,
    // and a table marked cross_tenant was declared shared on purpose.
    !table.multiTenant && !isTenantTable(table)
  );
  if (open.length > 0) {
    findings.push(
      `Data access check: ${open.map((table) => table.name).join(", ")} ${open.length === 1 ? "has" : "have"} no row policy, so every signed-in member can read and change all ${open.length === 1 ? "its" : "their"} rows. That's right for shared lookups (statuses, categories); give private tables a policy.`
    );
  }
  return findings;
}

// ../../packages/common/src/runtime/artifacts/index.ts
var APP_ARTIFACT_PATH = "artifacts/app.json";
var TABLE_ARTIFACTS_PATH = "artifacts/tables";
var TABLE_COLUMN_TYPES = ["string", "number", "boolean", "object", "date", "time", "datetime"];
var isPlainObject2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var quote = (value) => typeof value === "string" ? `"${value}"` : JSON.stringify(value);
var listSome = (values, max = 8) => values.length <= max ? values.join(", ") : `${values.slice(0, max).join(", ")}, \u2026 (+${values.length - max})`;
var displayName = (value) => {
  const words = value.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
function knownAgents(agents) {
  const accepted = /* @__PURE__ */ new Set();
  const names = [];
  for (const { key, text } of agents) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    if (!isPlainObject2(data)) {
      continue;
    }
    const identities = [key, data.name, data.title].filter(isNonEmptyString);
    for (const identity of identities) {
      accepted.add(identity);
      accepted.add(displayName(identity));
    }
    names.push(isNonEmptyString(data.name) ? data.name : key);
  }
  return { accepted, names };
}
function validateAppArtifacts({
  app,
  agents,
  tables = [],
  roles = [],
  dataAccessRules = false
}) {
  return [
    ...validateAppJson(app, agents),
    ...tables.flatMap(validateTableColumnTypes),
    ...validateTableAccess(app, tables, dataAccessRules ? roles.length : 0)
  ];
}
function validateTableColumnTypes({ key, text }) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isPlainObject2(data) || !Array.isArray(data.columns)) {
    return [];
  }
  const valid = TABLE_COLUMN_TYPES;
  const issues = [];
  data.columns.forEach((column, index) => {
    if (!isPlainObject2(column) || column.type === void 0 || valid.includes(column.type)) {
      return;
    }
    issues.push({
      file: `artifacts/tables/${key}.json`,
      pointer: `columns[${index}].type`,
      message: `${quote(column.type)} is not a column type \u2014 use one of ${TABLE_COLUMN_TYPES.join(", ")}; the platform refuses every insert that sets this column`
    });
  });
  return issues;
}
function validateAppJson(app, agents) {
  if (app === void 0) {
    return [];
  }
  const issues = [];
  const report = (pointer, message) => {
    issues.push({ ...pointer ? { pointer } : {}, message });
  };
  let data;
  try {
    data = JSON.parse(app);
  } catch (error) {
    report(
      void 0,
      `is not valid JSON: ${error instanceof Error ? error.message : String(error)} \u2014 fix the JSON; the platform skips an unparsable file, so the app's name, description and mini-apps do not sync`
    );
    return issues;
  }
  if (!isPlainObject2(data)) {
    report(
      void 0,
      `must be a JSON object at the top level \u2014 got ${data === null ? "null" : Array.isArray(data) ? "an array" : typeof data}`
    );
    return issues;
  }
  if (data.name && (typeof data.name !== "string" || data.name.length < 2)) {
    report("name", `${quote(data.name)} must be a string of at least 2 characters \u2014 the platform rejects the update`);
  }
  if (data.userProperties !== void 0 && data.userProperties !== null) {
    for (const { pointer, message } of validateAppUserProperties(data.userProperties)) {
      report(pointer, `${message} \u2014 the platform refuses the whole app.json update`);
    }
  }
  if (data.miniApps === void 0 || data.miniApps === null) {
    return issues;
  }
  for (const { pointer, message } of validateAppMiniApps(data.miniApps)) {
    report(pointer, message);
  }
  if (!Array.isArray(data.miniApps)) {
    return issues;
  }
  const known = knownAgents(agents);
  data.miniApps.forEach((item, index) => {
    if (isPlainObject2(item) && isNonEmptyString(item.agent) && !known.accepted.has(item.agent)) {
      report(
        `miniApps[${index}].agent`,
        `${quote(item.agent)} names no agent file \u2014 the rail shows no row for it; use the agent's exact artifact name (have: ${listSome(known.names) || "none"})`
      );
    }
  });
  return issues;
}
var formatArtifactIssue = (issue) => `${issue.severity === "warning" ? "warning: " : ""}${issue.file ?? APP_ARTIFACT_PATH}: ${issue.pointer ? `${issue.pointer}: ` : ""}${issue.message}`;
function validateTableAccess(app, files, roles) {
  const tables = {};
  for (const { key, text } of files) {
    try {
      const data = JSON.parse(text);
      if (isPlainObject2(data) && isNonEmptyString(data.name) && Array.isArray(data.columns)) {
        tables[key] = data;
      }
    } catch {
    }
  }
  let tenantTable;
  let declared;
  try {
    const data = app === void 0 ? void 0 : JSON.parse(app);
    tenantTable = isPlainObject2(data) && isNonEmptyString(data.tenantTable) ? data.tenantTable : void 0;
    declared = new Set(
      isPlainObject2(data) && Array.isArray(data.userProperties) ? data.userProperties.flatMap(
        (property) => isPlainObject2(property) && isNonEmptyString(property.name) ? [property.name] : []
      ) : []
    );
  } catch {
  }
  const undeclared = userDataReferences(
    Object.values(tables).map((table) => [table.rowPolicies, table.columnPolicies])
  ).filter((name) => !declared?.has(name));
  return [
    ...undeclared.map((name) => ({
      file: APP_ARTIFACT_PATH,
      pointer: "userProperties",
      message: `Data access check: rules read {{user.data.${name}}}, which userProperties doesn't declare \u2014 declare it ({ "name": "${name}", "type": \u2026 }), so whoever sets it gets a field for it; a member without it sees nothing through those rules.`,
      severity: "warning"
    })),
    ...validateArtifactTableAccess(tables, tenantTable).map((message) => ({ file: TABLE_ARTIFACTS_PATH, message })),
    ...checkArtifactTableAccess(tables, tenantTable, { roles }).map((message) => ({
      file: TABLE_ARTIFACTS_PATH,
      message,
      severity: "warning"
    }))
  ];
}

// src/modules/code-gen/cli.ts
import path4 from "path";
import { fileURLToPath, pathToFileURL } from "url";

// src/modules/code-gen/read-app-artifacts.ts
import fs3 from "fs/promises";
import path3 from "path";
var absentAs = (fallback) => (error) => {
  const code = error.code;
  if (code === "ENOENT" || code === "ENOTDIR") {
    return fallback;
  }
  throw error;
};
async function readArtifactFiles(dir) {
  const entries = await fs3.readdir(dir, { withFileTypes: true }).catch(absentAs([]));
  return Promise.all(
    entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort().map(async (name) => ({
      key: name.slice(0, -".json".length),
      text: await fs3.readFile(path3.join(dir, name), "utf-8")
    }))
  );
}
var DATA_ACCESS_SKILL = path3.join(
  ".claude",
  "skills",
  "multi-tenancy",
  "SKILL.md"
);
var DATA_ACCESS_SKILL_MARKER = "rowPolicies";
async function readAppArtifacts(projectRoot) {
  const artifactsDir = path3.join(projectRoot, ARTIFACTS_DIR_NAME);
  const [app, agents, tables, roles, dataAccessSkill] = await Promise.all([
    fs3.readFile(path3.join(artifactsDir, APP_FILENAME), "utf-8").catch(absentAs(void 0)),
    readArtifactFiles(path3.join(artifactsDir, ARTIFACT_SUBDIRS.agents)),
    readArtifactFiles(path3.join(artifactsDir, ARTIFACT_SUBDIRS.tables)),
    readArtifactFiles(path3.join(artifactsDir, ARTIFACT_SUBDIRS.roles)),
    fs3.readFile(path3.join(projectRoot, DATA_ACCESS_SKILL), "utf-8").catch(absentAs(""))
  ]);
  return {
    app,
    agents,
    tables,
    roles,
    dataAccessRules: dataAccessSkill.includes(DATA_ACCESS_SKILL_MARKER)
  };
}

// src/modules/code-gen/cli.ts
async function runCli(projectRoot) {
  const { counts } = await generateProductTypes(projectRoot);
  console.log(
    `Regenerated src/product-types.ts (tables: ${counts.tables}, views: ${counts.views}, actions: ${counts.actions}, agents: ${counts.agents}, agentChats: ${counts.agentChats}, pages: ${counts.pages}).`
  );
  const all = validateAppArtifacts(await readAppArtifacts(projectRoot));
  const warnings = all.filter((issue) => issue.severity === "warning");
  const issues = all.filter((issue) => issue.severity !== "warning");
  if (warnings.length > 0) {
    console.warn(
      `${warnings.length} warning${warnings.length === 1 ? "" : "s"} \u2014 fix, or tell the user why it's intended:
${warnings.map(formatArtifactIssue).join("\n")}`
    );
  }
  if (issues.length > 0) {
    throw new Error(
      `${issues.length} artifact error${issues.length === 1 ? "" : "s"}:
${issues.map(formatArtifactIssue).join("\n")}
The platform would refuse this at sync. Fix it and run pnpm gen:types again.`
    );
  }
}
var isMain = process.argv[1] && pathToFileURL(path4.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const projectRoot = process.argv[2] ? path4.resolve(process.argv[2]) : path4.join(path4.dirname(fileURLToPath(import.meta.url)), "..");
  runCli(projectRoot).catch((error) => {
    console.error(
      `Error generating product-types: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}
export {
  ARTIFACTS_DIR_NAME,
  ARTIFACT_PLACEHOLDER_PREFIX,
  ARTIFACT_SUBDIRS,
  SchemaBasedTypesGenerator,
  artifactTableToTableDescribe,
  artifactViewToViewDescribe,
  buildDescribeFromArtifacts,
  extractPageConstBlocks,
  generateCodeFromDescribe,
  generateProductTypes,
  isReservedArtifactColumnName,
  readArtifactsFromDirectory,
  readChatComponentsFromDirectory,
  readPagesFromDirectory,
  runCli
};
