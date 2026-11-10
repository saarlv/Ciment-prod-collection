// The server entry of a framework build (bundle contract 3). There is no server at runtime: this
// renders the pages the build writes to HTML (a public app's prerendered pages, and the fallback
// document every other path serves), whole, as a signed-out visitor sees them before their data.
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { type EntryContext, ServerRouter } from 'react-router';

declare const __BLOCKS_IMPORT_MAP__: { imports: Record<string, string> } | null;

/**
 * The platform runtime's import map, at the top of the <head>: browsers ignore one that arrives
 * after a module starts loading, and React writes the page's module preloads at the top of the
 * <head>. Right after the charset, which browsers look for in the page's first 1,024 bytes.
 */
const withImportMap = (html: string): string => {
  if (!__BLOCKS_IMPORT_MAP__) {
    return html;
  }
  const importMap = `<script type="importmap">${JSON.stringify(__BLOCKS_IMPORT_MAP__).replace(/</g, '\\u003c')}</script>`;
  const charset = html.match(/<meta charSet="utf-8"\/?>/i)?.[0];
  return charset ? html.replace(charset, `${charset}${importMap}`) : html.replace('<head>', `<head>${importMap}`);
};

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  return new Promise<Response>((resolve, reject) => {
    let statusCode = responseStatusCode;
    const { pipe } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        // The whole page, not its shell: the HTML is the page as written to the build.
        onAllReady() {
          const body = new PassThrough();
          const chunks: Buffer[] = [];
          body.on('data', (chunk: Buffer) => chunks.push(chunk));
          body.on('error', reject);
          body.on('end', () => {
            responseHeaders.set('Content-Type', 'text/html');
            resolve(
              new Response(withImportMap(Buffer.concat(chunks).toString('utf8')), {
                headers: responseHeaders,
                status: statusCode,
              }),
            );
          });
          pipe(body);
        },
        onShellError: reject,
        onError(error: unknown) {
          statusCode = 500;
          console.error(`[blocks] Could not render ${new URL(request.url).pathname}:`, error);
        },
      },
    );
  });
}
