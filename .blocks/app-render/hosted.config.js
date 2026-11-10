/**
 * AUTO-GENERATED — do not edit by hand.
 * Copied from apps/app-render/hosted.config.js
 * via apps/compiler/scripts/bundle-app-render-hosted.mjs
 * Regenerate: pnpm --filter @blockscom/compiler run bundle:app-render-hosted
 */
// The constants app-render's code reads (src/config.ts), per environment: app-render's own build
// defines them (vite.config.ts), and so does an app's framework build that bundles app-render's
// host (`@blockscom/app-render/hosted`).

export const envConfig = {
  development: {
    COMPILER_URL: "http://compiler.blocks.localhost:4566/blocks-data",
    BASE_URL: "http://blocks.localhost",
    GOOGLE_BASE_URL: "http://localhost",
  },
  production: {
    COMPILER_URL: "https://compiler.blocks.diy",
    BASE_URL: "https://blocks.diy",
    GOOGLE_BASE_URL: "https://blocks.diy",
  },
};

/** Vite `define` entries for app-render's code in `env` ("production" or "development"). */
export const hostDefines = (env) => {
  const config = envConfig[env];
  return {
    __COMPILER_URL__: JSON.stringify(config.COMPILER_URL),
    __BASE_URL__: JSON.stringify(config.BASE_URL),
    __GOOGLE_BASE_URL__: JSON.stringify(config.GOOGLE_BASE_URL),
    __ENV__: `"${env}"`,
    // native-dev's `--sentry` (SENTRY_ENABLED): report outside production too, into `development`.
    __SENTRY_ENABLED__: JSON.stringify(process.env.SENTRY_ENABLED === "true"),
  };
};

/**
 * The platform runtime: the modules an app takes from the platform rather than bundling, as an
 * older bundle takes them from app-render's page (`src/bundle-globals.ts`). app-render builds them
 * once per deploy (`vite.runtime.config.ts`) to `<RUNTIME_PATH>/<file>.mjs`; an app's framework
 * build leaves them out and maps them there with an import map. The entry files keep their names,
 * with a short cache, so every app runs the platform's current code, as with app-render's page;
 * the code they load is hashed. Adding a module is safe; removing or renaming one breaks every app
 * built against it.
 */
export const RUNTIME_PATH = "/assets/runtime";

/** Module id → its file under {@link RUNTIME_PATH}, without `.mjs`. */
export const runtimeModules = {
  react: "react",
  "react/jsx-runtime": "react-jsx-runtime",
  "react/compiler-runtime": "react-compiler-runtime",
  "react-dom": "react-dom",
  "react-dom/client": "react-dom-client",
  "react-router": "react-router",
  "react-router/dom": "react-router-dom",
  "@blocksdiy/blocks-client-sdk/app": "sdk-app",
  "@blocksdiy/blocks-client-sdk/reactSdk": "sdk-react",
  "@blocksdiy/blocks-client-sdk/clientSdk": "sdk-client",
  "@blocksdiy/react-common/agent-chat": "react-common-agent-chat",
  "@blocksdiy/react-common/new-agent-chat": "react-common-new-agent-chat",
  "@blocksdiy/react-common/agent-threads": "react-common-agent-threads",
  "@blockscom/app-render/hosted": "app-render-hosted",
};

/** The import map an app's document carries for the runtime. */
export const runtimeImportMap = () => ({
  imports: Object.fromEntries(Object.entries(runtimeModules).map(([id, file]) => [id, `${RUNTIME_PATH}/${file}.mjs`])),
});
