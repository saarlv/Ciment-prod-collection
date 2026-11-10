import { useMemo } from 'react';
import * as React from 'react';

import BaseMarkdown from '@/components/ui/base-markdown/base-markdown';
import { getExtensions } from '@/components/ui/base-markdown/extensions';

/*
 * Read-only markdown editor component for displaying content without editing capabilities
 *
 * Built on top of BaseEditor with editing features disabled, this component renders
 * markdown content in a read-only state while maintaining all display formatting
 * and styling.
 *
 * @param {Object} props - Component props
 * @param {string} props.value - The markdown content to be displayed
 * @returns {JSX.Element} ReadonlyEditor component
 * @example
 * ```tsx
 * import { Markdown } from "@/components/ui/markdown";
 *
 * function DocumentViewer() {
 *   const documentContent = "# Document Title\n\nThis is sample markdown content.";
 *
 *   return (
 *     <div className="preview-panel">
 *       <h2>Document Preview</h2>
 *       <Markdown value={documentContent} />
 *     </div>
 *   );
 * }
 * ```
 */

const Markdown = ({
  value,
  size,
  className,
}: {
  value: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) => {
  const extensions = useMemo(() => getExtensions({ editable: false }), []);

  return (
    <BaseMarkdown
      extensions={extensions}
      defaultValue={value}
      editable={false}
      size={size}
      className={className}
    />
  );
};

export { Markdown };

// @blocks-registry markdown@1.0.0 — registry version, never edit this line