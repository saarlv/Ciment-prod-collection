// For this app's code that imports '@/lib/require-shim'. Code you write needs no such import: the
// app's bundle resolves a CommonJS dependency's `require` calls itself. When you edit a file that
// imports this one, drop that import.
import * as React from 'react';

if (typeof globalThis.require !== 'function') {
  (globalThis as any).require = (id: string) => {
    if (id === 'react') return React;
    throw new Error(`${id} is not available to require()`);
  };
}
