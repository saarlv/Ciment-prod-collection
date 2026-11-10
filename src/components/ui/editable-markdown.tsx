import * as React from 'react';

import { useMemo, useRef } from 'react';

import BaseMarkdown from '@/components/ui/base-markdown/base-markdown';
import { type Editor, BubbleMenu as TiptapBubbleMenu } from '@tiptap/react';
import { getExtensions } from '@/components/ui/base-markdown/extensions';
import { useCurrentEditor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Bold, Italic, Strikethrough } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

import { cn } from '@/lib/utils';

/*
 * Editable markdown editor component with full editing capabilities and change tracking
 *
 * Built on top of BaseEditor with editing features enabled, this component provides
 * a rich text editing experience for markdown content with real-time change detection
 * and state synchronization.
 *
 * @param {Object} props - Component props
 * @param {string} props.defaultValue - The initial markdown content to be displayed and edited
 * @param {function} props.onChange - Callback function triggered when content changes, receives the updated markdown string
 * @returns {JSX.Element} EditableEditor component
 * @example
 * ```tsx
 * import { EditableMarkdown } from "@/components/ui/editable-markdown";
 *
 * function DocumentEditor() {
 *   const [content, setContent] = useState("# Document Title\n\nStart typing here...");
 *
 *   const handleContentChange = (newContent: string) => {
 *     setContent(newContent);
 *     // Auto-save or other logic here
 *   };
 *
 *   return (
 *     <div className="editor-panel">
 *       <h2>Document Editor</h2>
 *       <EditableMarkdown
 *         defaultValue={content}
 *         onChange={handleContentChange}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */

const TextTypeOptions: {
  label: string;
  short: string;
  getIsActive: ({ editor }: { editor: Editor }) => boolean;
  toggleFunction: ({ editor }: { editor: Editor }) => void;
}[] = [
  {
    label: 'Heading 1',
    short: 'H1',
    getIsActive: ({ editor }) => editor.isActive('heading', { level: 1 }),
    toggleFunction: ({ editor }) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: 'Heading 2',
    short: 'H2',
    getIsActive: ({ editor }) => editor.isActive('heading', { level: 2 }),
    toggleFunction: ({ editor }) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    short: 'H3',
    getIsActive: ({ editor }) => editor.isActive('heading', { level: 3 }),
    toggleFunction: ({ editor }) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Heading 4',
    short: 'H4',
    getIsActive: ({ editor }) => editor.isActive('heading', { level: 4 }),
    toggleFunction: ({ editor }) =>
      editor.chain().focus().toggleHeading({ level: 4 }).run(),
  },
  {
    label: 'Paragraph',
    short: '¶',
    getIsActive: ({ editor }) => editor.isActive('paragraph'),
    toggleFunction: ({ editor }) => editor.chain().focus().setParagraph().run(),
  },
];

/**
 * Inline text-type toggles for the bubble menu. Rendered as plain buttons (not a
 * portaled Select) so the control works identically on radix and base-ui apps and
 * never steals focus from the tiptap selection. The `container` prop of the old
 * Select-based implementation is kept for props compatibility and ignored.
 */
export const TextTypeButton = (_props: { container?: HTMLElement | null }) => {
  const { editor } = useCurrentEditor();

  const textTypeValue = useMemo(() => {
    if (!editor) {
      return;
    }

    return TextTypeOptions.find((option) => option.getIsActive({ editor }))
      ?.label;
  }, [editor, editor?.state.selection]);

  if (!editor) {
    return null;
  }

  return (
    <div className="flex items-center">
      {TextTypeOptions.map((option) => (
        <Button
          key={option.label}
          variant="ghost"
          size="icon"
          type="button"
          title={option.label}
          aria-label={option.label}
          onClick={() => option.toggleFunction({ editor })}
          className={cn(
            'text-xs font-semibold',
            textTypeValue === option.label && 'text-primary',
          )}
        >
          {option.short}
        </Button>
      ))}
    </div>
  );
};

const BubbleMenu = () => {
  const { editor } = useCurrentEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <TiptapBubbleMenu editor={editor} shouldShow={() => true}>
        <div
          className="bg-background border rounded-sm shadow-sm flex items-center"
          ref={containerRef}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={editor?.isActive('bold') ? 'text-primary' : ''}
            type="button"
          >
            <Bold />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={editor?.isActive('italic') ? 'text-primary' : ''}
            type="button"
          >
            <Italic />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            className={editor?.isActive('strike') ? 'text-primary' : ''}
            type="button"
          >
            <Strikethrough />
          </Button>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <TextTypeButton container={containerRef.current} />
        </div>
      </TiptapBubbleMenu>
    </div>
  );
};

const EditableMarkdown = ({
  defaultValue,
  onChange,
  size = 'md',
  className,
}: {
  defaultValue: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) => {
  const extensions = useMemo(() => getExtensions({ editable: true }), []);

  return (
    <BaseMarkdown
      extensions={extensions}
      defaultValue={defaultValue}
      onChange={({ editor }) => onChange(editor.storage.markdown.getMarkdown())}
      editable
      size={size}
      className={cn('min-w-64 min-h-6', className)}
    >
      <BubbleMenu />
      {/* <FloatingMenu /> */}
    </BaseMarkdown>
  );
};

export { EditableMarkdown };

// @blocks-registry markdown@1.0.0 — registry version, never edit this line