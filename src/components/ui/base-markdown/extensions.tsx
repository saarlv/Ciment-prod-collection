import { Extension, mergeAttributes } from '@tiptap/core';
import { Heading } from '@tiptap/extension-heading';
import { Image } from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Paragraph } from '@tiptap/extension-paragraph';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

const DECO_NAME = 'onBlurHighlight';
const ACTION_TYPES = {
  BLUR: 'blur',
  FOCUS: 'focus',
};

export const OnBlurHighlightExtension = Extension.create({
  name: DECO_NAME,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey(DECO_NAME),

        state: {
          init(_config) {
            return DecorationSet.empty;
          },

          apply: (transaction, oldState) => {
            const { selection, doc } = transaction;
            const decoTransform = transaction.getMeta(DECO_NAME);
            const hasSelection = selection && selection.from !== selection.to;

            if (!hasSelection || decoTransform?.action === ACTION_TYPES.FOCUS) {
              return DecorationSet.empty;
            }

            if (hasSelection && decoTransform?.action === ACTION_TYPES.BLUR) {
              const decoration = Decoration.inline(
                selection.from,
                selection.to,
                {
                  class: 'bg-secondary/50 py-0.4',
                },
              );

              return DecorationSet.create(doc, [decoration]);
            }

            return oldState;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state);
          },
          handleDOMEvents: {
            blur: (view) => {
              const { tr } = view.state;

              const transaction = tr.setMeta(DECO_NAME, {
                from: tr.selection.from,
                to: tr.selection.to,
                action: ACTION_TYPES.BLUR,
              });

              view.dispatch(transaction);
            },

            focus: (view) => {
              const { tr } = view.state;

              const transaction = tr.setMeta(DECO_NAME, {
                from: tr.selection.from,
                to: tr.selection.to,
                action: ACTION_TYPES.FOCUS,
              });

              view.dispatch(transaction);
            },
          },
        },
      }),
    ];
  },
});

const DEFAULT_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    paragraph: false,
  }),
  Placeholder.configure({
    placeholder: 'Write something...',
    emptyNodeClass:
      'before:cursor-text before:content-[attr(data-placeholder)] before:text-muted-foreground before:float-left before:h-0 before:pointer-events-none',
  }),
  Paragraph,
  Heading,
  Markdown,
  Image,
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  Link.configure({
    defaultProtocol: 'https',
    protocols: ['http', 'https', 'mailto'],
    isAllowedUri: (url, ctx) => {
      try {
        // construct URL
        const parsedUrl = url.includes(':')
          ? new URL(url)
          : new URL(`${ctx.defaultProtocol}://${url}`);

        // use default validation
        if (!ctx.defaultValidate(parsedUrl.href)) {
          return false;
        }

        // disallowed protocols
        const disallowedProtocols = ['ftp', 'file'];
        const protocol = parsedUrl.protocol.replace(':', '');

        if (disallowedProtocols.includes(protocol)) {
          return false;
        }

        // only allow protocols specified in ctx.protocols
        const allowedProtocols = ctx.protocols.map((p) =>
          typeof p === 'string' ? p : p.scheme,
        );

        if (!allowedProtocols.includes(protocol)) {
          return false;
        }

        // disallowed domains
        const disallowedDomains = [
          'example-phishing.com',
          'malicious-site.net',
        ];
        const domain = parsedUrl.hostname;

        if (disallowedDomains.includes(domain)) {
          return false;
        }

        // all checks have passed
        return true;
      } catch {
        return false;
      }
    },
    shouldAutoLink: (url) => {
      try {
        // construct URL
        const parsedUrl = url.includes(':')
          ? new URL(url)
          : new URL(`https://${url}`);

        // only auto-link if the domain is not in the disallowed list
        const disallowedDomains = [
          'example-no-autolink.com',
          'another-no-autolink.com',
        ];
        const domain = parsedUrl.hostname;

        return !disallowedDomains.includes(domain);
      } catch {
        return false;
      }
    },
  }),
];

const EDITABLE_EXTENSIONS = [OnBlurHighlightExtension];

export const getExtensions = ({ editable }: { editable: boolean }) => {
  return [...DEFAULT_EXTENSIONS, ...(editable ? EDITABLE_EXTENSIONS : [])];
};

// @blocks-registry markdown@1.0.0 — registry version, never edit this line