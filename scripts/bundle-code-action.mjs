/**
 * AUTO-GENERATED — do not edit by hand.
 * Bundled from apps/compiler/src/modules/lambda/bundle-validator-entry.ts
 * via apps/compiler/scripts/bundle-code-action-validator.mjs
 * Regenerate: pnpm --filter @blockscom/compiler run bundle:code-action-validator
 */

// src/modules/lambda/bundle-validator-entry.ts
import { execFile } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readdir as readdir2,
  readFile as readFile2,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join as join2 } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";

// src/modules/code-actions/code-action-language.ts
var CodeActionLanguage = {
  JAVASCRIPT: "javascript",
  PYTHON: "python"
};
var CODE_ACTION_CODE_FILENAME_BY_LANGUAGE = {
  [CodeActionLanguage.JAVASCRIPT]: "code.ts",
  [CodeActionLanguage.PYTHON]: "code.py"
};
var CODE_ACTION_CODE_FILENAMES = new Set(
  Object.values(CODE_ACTION_CODE_FILENAME_BY_LANGUAGE)
);
var LANGUAGE_PRECEDENCE = [
  CodeActionLanguage.JAVASCRIPT,
  CodeActionLanguage.PYTHON
];
function codeActionLanguagesByPrecedence() {
  return LANGUAGE_PRECEDENCE;
}

// src/modules/builder-agent/artifacts/constants.ts
var CODE_ACTIONS_DIR_NAME = "code-actions";
var CODE_ACTION_SETTINGS_FILENAME = "settings.json";
var CODE_ACTION_REQUIREMENTS_FILENAME = "requirements.txt";
var CODE_ACTION_TESTS_DIR_NAME = "tests";
var CODE_ACTION_SHARED_DIR_NAME = "shared";
var CODE_ACTION_SHARED_PATH_PREFIX = `${CODE_ACTIONS_DIR_NAME}/${CODE_ACTION_SHARED_DIR_NAME}/`;
var CODE_ACTION_RESERVED_FILENAMES = /* @__PURE__ */ new Set([
  ...CODE_ACTION_CODE_FILENAMES,
  CODE_ACTION_SETTINGS_FILENAME,
  CODE_ACTION_REQUIREMENTS_FILENAME,
  // Deploy copies these into action/ for legacy ./ imports — not private utils.
  "blocks-client.ts",
  "blocks-client-mappings.ts",
  "browsing.ts"
]);

// src/modules/lambda/python-bundle.helpers.ts
var PIP_INSTALL_MAX_BUFFER = 10 * 1024 * 1024;
var LAMBDA_UNZIPPED_LIMIT_BYTES = 250 * 1024 * 1024;
var PIP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._-]+\])?$/;
var PIP_SPECIFIER_RE = /^(===|==|!=|<=|>=|~=|<|>)/;
function toPipRequirement(name, spec) {
  const distribution = (name ?? "").trim();
  if (!distribution || !PIP_NAME_RE.test(distribution)) {
    return null;
  }
  const version = (spec ?? "").trim();
  if (!version || version === "*" || version.toLowerCase() === "latest") {
    return distribution;
  }
  if (PIP_SPECIFIER_RE.test(version)) {
    return `${distribution}${version}`;
  }
  const rangeMatch = version.match(/^[\^~]\s*(.+)$/);
  if (rangeMatch) {
    const floor = normalizeVersion(rangeMatch[1]);
    return floor ? `${distribution}>=${floor}` : null;
  }
  const pinned = normalizeVersion(version);
  return pinned ? `${distribution}==${pinned}` : null;
}
function normalizeVersion(version) {
  const trimmed = version.trim().replace(/^v/, "");
  return /^\d[A-Za-z0-9.*+!-]*$/.test(trimmed) ? trimmed : null;
}
function resolvePipRequirements(imports) {
  const lines = [];
  const dropped = [];
  for (const [name, spec] of Object.entries(imports ?? {})) {
    const requirement = toPipRequirement(name, spec);
    if (requirement) {
      lines.push(requirement);
    } else {
      dropped.push(`${name}: ${JSON.stringify(spec ?? "")}`);
    }
  }
  return { lines: lines.sort(), dropped: dropped.sort() };
}
function parseRequirementsTxt(raw) {
  const imports = {};
  for (const rawLine of (raw ?? "").split(/\r?\n/)) {
    const line = rawLine.split(/\s+#/)[0].trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(
      /^([A-Za-z0-9][A-Za-z0-9._-]*(?:\[[A-Za-z0-9,._-]+\])?)\s*(.*)$/
    );
    if (!match) {
      imports[line] = "";
      continue;
    }
    const [, name, rest] = match;
    imports[name] = rest.trim();
  }
  return imports;
}

// src/modules/builder-agent/helpers/code-action-disk.helpers.ts
import fs from "fs/promises";
import path from "path";
var DEFAULT_IMPORTS = { axios: "^1.11.0" };
var PRIVATE_UTIL_EXT_RE = /\.(ts|js|mjs|cjs|py)$/i;
var SPEC_FILE_RE = /\.spec\.[^.]+$/i;
function parseSettingsImports(raw) {
  const imports = { ...DEFAULT_IMPORTS };
  const parsed = JSON.parse(raw);
  if (parsed.imports) {
    for (const [key, value] of Object.entries(parsed.imports)) {
      const version = value.startsWith("npm:") && value.includes("@") ? value.slice(value.lastIndexOf("@") + 1) : value;
      imports[key] = version;
    }
  }
  return imports;
}
function isCodeActionSpecFileName(fileName) {
  return SPEC_FILE_RE.test(fileName.replace(/^.*[/\\]/, ""));
}
async function readCodeActionImportsFromDisk(actionDir) {
  try {
    const content = await fs.readFile(
      path.join(actionDir, CODE_ACTION_SETTINGS_FILENAME),
      "utf-8"
    );
    return parseSettingsImports(content);
  } catch {
    return { ...DEFAULT_IMPORTS };
  }
}
async function readCodeActionRequirementsFromDisk(actionDir) {
  try {
    const content = await fs.readFile(
      path.join(actionDir, CODE_ACTION_REQUIREMENTS_FILENAME),
      "utf-8"
    );
    return parseRequirementsTxt(content);
  } catch {
    return {};
  }
}
async function detectCodeActionLanguage(actionDir) {
  for (const language of codeActionLanguagesByPrecedence()) {
    try {
      await fs.access(
        path.join(actionDir, CODE_ACTION_CODE_FILENAME_BY_LANGUAGE[language])
      );
      return language;
    } catch {
    }
  }
  return null;
}
var SKIPPED_MODULE_DIR_RE = /^(?:node_modules|__pycache__|\..*)$/;
async function listCodeActionModulePaths(rootDir, options) {
  const paths = [];
  const walk = async (dir, prefix) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const modulePath = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIPPED_MODULE_DIR_RE.test(entry.name) || !prefix && options.skipTopLevelDirs?.has(entry.name)) {
          continue;
        }
        await walk(path.join(dir, entry.name), `${modulePath}/`);
      } else if (entry.isFile() && options.include(modulePath)) {
        paths.push(modulePath);
      }
    }
  };
  await walk(rootDir, "");
  return paths.sort();
}
function isCodeActionPrivateUtilPath(modulePath) {
  const normalized = modulePath.replace(/\\/g, "/");
  return (normalized.includes("/") || !CODE_ACTION_RESERVED_FILENAMES.has(normalized)) && !isCodeActionSpecFileName(normalized) && PRIVATE_UTIL_EXT_RE.test(normalized);
}
function listCodeActionPrivateUtilPaths(actionDir) {
  return listCodeActionModulePaths(actionDir, {
    skipTopLevelDirs: /* @__PURE__ */ new Set([CODE_ACTION_TESTS_DIR_NAME]),
    include: isCodeActionPrivateUtilPath
  });
}
async function readCodeActionPrivateUtilFiles(actionDir) {
  const files = {};
  for (const modulePath of await listCodeActionPrivateUtilPaths(actionDir)) {
    try {
      files[modulePath] = await fs.readFile(
        path.join(actionDir, modulePath),
        "utf-8"
      );
    } catch {
    }
  }
  return files;
}

// src/modules/lambda/code-action-bundle.helpers.ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// src/modules/lambda/platform-shared-scaffold.ts
import path2 from "node:path";
import { fileURLToPath } from "node:url";
var PLATFORM_SHARED_BLOCKS_DIR_NAME = "blocks";
var PLATFORM_SHARED_TESTING_DIR_NAME = "testing";
var PLATFORM_SHARED_STATIC_REL_PATHS = [
  `${PLATFORM_SHARED_BLOCKS_DIR_NAME}/blocks-client.ts`,
  `${PLATFORM_SHARED_BLOCKS_DIR_NAME}/browsing.ts`,
  `${PLATFORM_SHARED_BLOCKS_DIR_NAME}/index.ts`,
  `${PLATFORM_SHARED_TESTING_DIR_NAME}/testing.ts`,
  "README.md"
];
var ACTION_FOLDER_COMPAT_COPIES = [
  "blocks-client.ts",
  "blocks-client-mappings.ts",
  "browsing.ts"
];
var HERE = path2.dirname(fileURLToPath(import.meta.url));
var PLATFORM_SHARED_SCAFFOLD_DIR = path2.join(
  HERE,
  "..",
  "..",
  "..",
  "boilerplate-v2",
  "code-actions",
  "shared"
);

// src/modules/lambda/code-action-bundle.helpers.ts
var BROWSING_RUNTIME_EXTERNALS = [
  "@browserbasehq/sdk",
  "playwright-core",
  "@browserbasehq/stagehand"
];
var KNOWN_NATIVE = /* @__PURE__ */ new Set([
  "sharp",
  "bcrypt",
  "canvas",
  "better-sqlite3",
  "sqlite3",
  "node-sass",
  "sass-embedded",
  "@grpc/grpc-js",
  "grpc",
  "sodium-native",
  "re2",
  "@tensorflow/tfjs-node"
]);
var NPM_INSTALL_ARGS = [
  "install",
  "--omit=dev",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "--loglevel=error"
];
var NPM_INSTALL_TIMEOUT_MS = 9e4;
var NPM_INSTALL_MAX_BUFFER = 10 * 1024 * 1024;
function fixImports(content) {
  return content.replace(/from\s+(['"])(fs)\1;/g, "from 'node:fs';").replace(/from\s+(['"])(path)\1;/g, "from 'node:path';").replace(/from\s+(['"])(crypto)\1;/g, "from 'node:crypto';").replace(
    /from\s+(['"])\.\.\/shared\/(blocks-client(?:-mappings)?\.ts)\1/g,
    `from $1../shared/${PLATFORM_SHARED_BLOCKS_DIR_NAME}/$2$1`
  ).replace(
    /from\s+(['"])\.\.\/shared\/(browsing\.ts)\1/g,
    `from $1../shared/${PLATFORM_SHARED_BLOCKS_DIR_NAME}/$2$1`
  ).replace(
    /from\s+(['"])\.\.\/shared\/testing\.ts\1/g,
    "from $1../shared/testing/testing.ts$1"
  ).replace(
    /from\s+(['"])\.\.\/\.\.\/shared\/testing\.ts\1/g,
    "from $1../../shared/testing/testing.ts$1"
  ).replace(
    /from\s+(['"])\.\.\/\.\.\/shared\/(blocks-client(?:-mappings)?\.ts)\1/g,
    `from $1../../shared/${PLATFORM_SHARED_BLOCKS_DIR_NAME}/$2$1`
  ).replace(
    /from\s+(['"])\.\.\/\.\.\/shared\/(browsing\.ts)\1/g,
    `from $1../../shared/${PLATFORM_SHARED_BLOCKS_DIR_NAME}/$2$1`
  ).replace(/from\s+(['"])shared\/([^'"]+)\1/g, "from $1../shared/$2$1");
}
function fixHandlerImports(handlerSource) {
  return handlerSource.replace(
    /(['"])\.\/ai-generated-code\.ts\1/g,
    "$1./action/ai-generated-code.ts$1"
  ).replace(
    /from\s+(['"])\.\/browsing\.ts\1/g,
    `from './shared/${PLATFORM_SHARED_BLOCKS_DIR_NAME}/browsing.ts'`
  );
}
async function findNativePackages(nodeModulesDir) {
  const found = /* @__PURE__ */ new Set();
  async function visit(dir, depth) {
    if (depth > 8) {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const names = entries.map((e) => e.name);
    if (names.includes("package.json")) {
      try {
        const pkg = JSON.parse(
          await readFile(join(dir, "package.json"), "utf-8")
        );
        if (pkg.name && KNOWN_NATIVE.has(pkg.name)) {
          found.add(pkg.name);
        }
      } catch {
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "." && entry.name !== ".." && entry.name !== ".bin") {
        const next = join(dir, entry.name);
        if (entry.name.startsWith("@")) {
          await visit(next, depth);
        } else {
          await visit(next, depth + 1);
        }
      }
    }
  }
  await visit(nodeModulesDir, 0);
  return [...found].sort();
}

// src/modules/lambda/normalize-user-imports.ts
import { builtinModules } from "node:module";
var CDN_HOSTS = [
  "esm.sh",
  "cdn.skypack.dev",
  "unpkg.com",
  "cdn.jsdelivr.net"
];
var CDN_PATH_PREFIX_RE = /^(?:\*|npm\/|stable\/|v\d+\/|-\/)+/;
var IMPORT_CTX = String.raw`(\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)`;
function parsePackagePath(path3, keepSubpath) {
  const match = path3.match(/^(@[^/@]+\/[^/@]+|[^/@]+)(?:@([^/]+))?(\/.*)?$/);
  if (!match || !match[1]) {
    return null;
  }
  const [, name, version, subpath] = match;
  return {
    name,
    version: version || "*",
    subpath: keepSubpath ? subpath || "" : ""
  };
}
function parseCdnPackageUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  if (CDN_HOSTS.includes(host)) {
    const path3 = parsed.pathname.replace(/^\//, "").replace(CDN_PATH_PREFIX_RE, "");
    return parsePackagePath(
      path3,
      /* keepSubpath */
      true
    );
  }
  if (host === "deno.land" && parsed.pathname.startsWith("/x/")) {
    const path3 = parsed.pathname.replace(/^\/x\//, "");
    return parsePackagePath(
      path3,
      /* keepSubpath */
      false
    );
  }
  return null;
}
function normalizeUserImports(code) {
  const extraDeps = {};
  const collect = (name, version) => {
    if (!extraDeps[name] || extraDeps[name] === "*" && version !== "*") {
      extraDeps[name] = version;
    }
  };
  const cdnRe = new RegExp(
    IMPORT_CTX + String.raw`(['"])(https?:\/\/[^'"]+)\2`,
    "g"
  );
  let normalized = code.replace(
    cdnRe,
    (matched, pre, quote, url) => {
      const pkg = parseCdnPackageUrl(url);
      if (!pkg) {
        return matched;
      }
      collect(pkg.name, pkg.version);
      return `${pre}${quote}${pkg.name}${pkg.subpath}${quote}`;
    }
  );
  const npmRe = new RegExp(
    IMPORT_CTX + String.raw`(['"])npm:((?:@[^/@'"]+\/[^/@'"]+)|(?:[^/@'"]+))(?:@([^/'"]+))?((?:\/[^'"]*)?)\2`,
    "g"
  );
  normalized = normalized.replace(
    npmRe,
    (_m, pre, quote, name, ver, sub) => {
      collect(name, ver || "*");
      return `${pre}${quote}${name}${sub || ""}${quote}`;
    }
  );
  const rejectRe = new RegExp(
    IMPORT_CTX + String.raw`['"](?:jsr:|https?:\/\/)[^'"]+['"]`
  );
  const unsupported = normalized.match(rejectRe);
  if (unsupported) {
    throw new Error(
      `Unsupported import for the Lambda runtime: ${unsupported[0].trim()}. URL and jsr: imports aren't supported \u2014 use an npm package (bare import, e.g. import x from 'pkg', and add "pkg" to the action's imports).`
    );
  }
  return { code: normalized, extraDeps };
}
var NODE_BUILTIN_DEPS = new Set(
  builtinModules.flatMap((m) => [m, `node:${m}`])
);
function isNodeBuiltinDep(name, spec) {
  return NODE_BUILTIN_DEPS.has(name) || name.startsWith("node:") || typeof spec === "string" && spec.startsWith("node:");
}

// src/modules/lambda/bundle-validator-entry.ts
var execFileAsync = promisify(execFile);
var CODE_ACTIONS_DIR = join2(process.cwd(), "code-actions");
var SHARED_DIR = join2(CODE_ACTIONS_DIR, "shared");
var PYTHON_CODE_FILENAME = CODE_ACTION_CODE_FILENAME_BY_LANGUAGE[CodeActionLanguage.PYTHON];
async function materializeShared(dir) {
  try {
    await access(SHARED_DIR);
  } catch {
    throw new Error(
      "Missing code-actions/shared. The shared scaffold must exist before bundling."
    );
  }
  await cp(SHARED_DIR, join2(dir, "shared"), { recursive: true });
}
async function copyActionFolderCompat(dir) {
  const blocksDir = join2(dir, "shared", PLATFORM_SHARED_BLOCKS_DIR_NAME);
  const actionDir = join2(dir, "action");
  for (const name of ACTION_FOLDER_COMPAT_COPIES) {
    await cp(join2(blocksDir, name), join2(actionDir, name));
  }
}
async function installDeps(dir, imports) {
  const deps = Object.fromEntries(
    Object.entries(imports).filter(
      ([name, spec]) => !isNodeBuiltinDep(name, spec)
    )
  );
  if (Object.keys(deps).length === 0) {
    return;
  }
  await writeFile(
    join2(dir, "package.json"),
    JSON.stringify({
      name: "blocks-code-action",
      private: true,
      dependencies: deps
    })
  );
  try {
    await execFileAsync("npm", NPM_INSTALL_ARGS, {
      cwd: dir,
      maxBuffer: NPM_INSTALL_MAX_BUFFER,
      timeout: NPM_INSTALL_TIMEOUT_MS
    });
  } catch (error) {
    const e = error;
    const detail = e?.stderr?.toString().trim() || e?.stdout?.toString().trim() || (error instanceof Error ? error.message : String(error));
    throw new Error(`npm install failed:
${detail}`);
  }
  const nativePkgs = await findNativePackages(join2(dir, "node_modules"));
  if (nativePkgs.length > 0) {
    throw new Error(
      `Native npm package(s) are not supported on the Lambda runtime (pure-JS packages only): ${nativePkgs.join(", ")}`
    );
  }
}
async function listActionDirs() {
  try {
    const entries = await readdir2(CODE_ACTIONS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && e.name !== "shared").map((e) => e.name);
  } catch {
    return [];
  }
}
async function resolveActions(requested) {
  const dirs = await listActionDirs();
  if (!requested) {
    return dirs;
  }
  const match = dirs.find(
    (name) => name.toLowerCase() === requested.toLowerCase()
  );
  if (!match) {
    throw new Error(
      `No code action folder "${requested}" under code-actions/. Available: ${dirs.join(", ") || "none"}.`
    );
  }
  return [match];
}
async function validatePythonAction(actionName) {
  const actionDir = join2(CODE_ACTIONS_DIR, actionName);
  const codePath = join2(actionDir, PYTHON_CODE_FILENAME);
  const imports = await readCodeActionRequirementsFromDisk(actionDir);
  const { dropped } = resolvePipRequirements(imports);
  if (dropped.length > 0) {
    throw new Error(
      `${CODE_ACTION_REQUIREMENTS_FILENAME} entries are not valid pip requirements: ${dropped.join("; ")}
Use a bare package name or a PEP 440 specifier, e.g. "requests" or "requests>=2.32" or "requests==2.32.3".`
    );
  }
  try {
    await execFileAsync("python3", ["-m", "py_compile", codePath]);
  } catch (error) {
    const e = error;
    if (e?.code === "ENOENT") {
      return "requirements checked; python3 not available, so code.py was NOT syntax-checked";
    }
    const detail = e?.stderr?.toString().trim() || e?.stdout?.toString().trim() || (error instanceof Error ? error.message : String(error));
    throw new Error(`python syntax check failed:
${detail}`);
  } finally {
    await rm(join2(actionDir, "__pycache__"), { recursive: true, force: true });
  }
  return "requirements checked; code.py syntax-checked";
}
async function bundleAction(actionName) {
  let userCode;
  try {
    userCode = await readFile2(
      join2(CODE_ACTIONS_DIR, actionName, "code.ts"),
      "utf-8"
    );
  } catch {
    throw new Error(`Missing code-actions/${actionName}/code.ts.`);
  }
  const { code: normalizedCode, extraDeps } = normalizeUserImports(userCode);
  const settingsImports = await readCodeActionImportsFromDisk(
    join2(CODE_ACTIONS_DIR, actionName)
  );
  const mergedImports = { ...extraDeps, ...settingsImports };
  const actionDir = join2(CODE_ACTIONS_DIR, actionName);
  const privateUtilFiles = await readCodeActionPrivateUtilFiles(actionDir);
  const compatNames = new Set(ACTION_FOLDER_COMPAT_COPIES);
  const dir = await mkdtemp(join2(tmpdir(), "blocks-ca-bundle-"));
  try {
    await materializeShared(dir);
    await mkdir(join2(dir, "action"), { recursive: true });
    await writeFile(
      join2(dir, "action", "ai-generated-code.ts"),
      fixImports(normalizedCode)
    );
    for (const [name, content] of Object.entries(privateUtilFiles)) {
      if (compatNames.has(name)) {
        continue;
      }
      const absPath = join2(dir, "action", name);
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content);
    }
    await copyActionFolderCompat(dir);
    const handlerSource = await readFile2(
      join2(dir, "shared", PLATFORM_SHARED_BLOCKS_DIR_NAME, "index.ts"),
      "utf-8"
    );
    await writeFile(join2(dir, "index.ts"), fixHandlerImports(handlerSource));
    await installDeps(dir, mergedImports);
    await build({
      entryPoints: [join2(dir, "index.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      write: false,
      // Browsing deps stay external (dynamic import on the browsing path); everything else —
      // including the action's installed npm deps — is resolved and bundled, so missing or
      // misspelled packages fail here just like they would at deploy.
      external: BROWSING_RUNTIME_EXTERNALS,
      logLevel: "silent"
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function main() {
  const requested = process.argv[2]?.trim() || void 0;
  const actions = await resolveActions(requested);
  if (actions.length === 0) {
    console.log("No code actions to bundle.");
    return;
  }
  let failed = false;
  for (const actionName of actions) {
    const language = await detectCodeActionLanguage(
      join2(CODE_ACTIONS_DIR, actionName)
    );
    try {
      if (language === CodeActionLanguage.PYTHON) {
        const checked = await validatePythonAction(actionName);
        console.log(
          `\u2713 Validated ${actionName} (python \u2014 ${checked})`
        );
      } else {
        await bundleAction(actionName);
        console.log(`\u2713 Bundled ${actionName}`);
      }
    } catch (error) {
      const e = error;
      const message = e?.errors ? e.errors.map((err) => err.text).join("\n") : error instanceof Error ? error.message : String(error);
      failed = true;
      console.error(`\u2717 Bundle failed for ${actionName}:
${message}`);
    }
  }
  if (failed) {
    process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
