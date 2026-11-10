// vite-plugin-json-error-reporter.js
import fs from 'fs';

export function jsonErrorReporterPlugin() {
  let errors = [];

  return {
    name: 'json-error-reporter',
    buildStart() {
      errors = [];
    },
    onwarn(warning, warn) {
      errors.push({
        type: 'warning',
        message: warning.message,
        code: warning.code,
        plugin: warning.plugin,
        loc: warning.loc,
      });
      // Optionally, suppress the default warning
      // warn(warning);
    },
    buildEnd(error) {
      if (error) {
        errors.push({
          type: 'error',
          message: error.message,
          stack: error.stack,
          plugin: error.plugin,
          loc: error.loc,
        });
      }
      if (errors.length > 0) {
        fs.writeFileSync('build-errors.json', JSON.stringify(errors, null, 2));
      }
    },
    renderError(error) {
      errors.push({
        type: 'error',
        message: error.message,
        stack: error.stack,
        plugin: error.plugin,
        loc: error.loc,
      });
      fs.writeFileSync('build-errors.json', JSON.stringify(errors, null, 2));
    },
  };
}
