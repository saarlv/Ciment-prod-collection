/**
 * AUTO-GENERATED — do not edit by hand.
 * Copied from apps/app-render/hosted.config.d.ts
 * via apps/compiler/scripts/bundle-app-render-hosted.mjs
 * Regenerate: pnpm --filter @blockscom/compiler run bundle:app-render-hosted
 */
export declare const envConfig: Record<
  "development" | "production",
  { COMPILER_URL: string; BASE_URL: string; GOOGLE_BASE_URL: string }
>;
export declare const hostDefines: (env: "development" | "production") => Record<string, string>;
export declare const RUNTIME_PATH: string;
export declare const runtimeModules: Record<string, string>;
export declare const runtimeImportMap: () => { imports: Record<string, string> };
