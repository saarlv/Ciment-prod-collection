import type { Plugin } from 'vite';

export declare function generateAppIndexPlugin(options: {
  srcDir: string;
}): Plugin;

export declare function appEntryPlugin(options: { srcDir: string }): Plugin;
