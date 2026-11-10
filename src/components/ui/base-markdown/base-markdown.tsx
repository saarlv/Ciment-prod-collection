import React from 'react';
import { Content, EditorProvider, EditorProviderProps } from '@tiptap/react';
import { useCurrentEditor } from '@tiptap/react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

const ChangesListener = ({ value }: { value: Content }) => {
  const { editor } = useCurrentEditor();

  useEffect(() => {
    editor?.commands.setContent(value);
  }, [value, editor]);

  return null;
};

const BaseMarkdown = ({
  extensions,
  defaultValue,
  onChange,
  size = 'md',
  editable,
  children,
  className,
}: {
  extensions: EditorProviderProps['extensions'];
  defaultValue: Content;
  onChange?: EditorProviderProps['onUpdate'];
  size?: 'sm' | 'md' | 'lg';
  editable: EditorProviderProps['editable'];
  children?: EditorProviderProps['children'];
  className?: string;
}) => {
  return (
    <EditorProvider
      extensions={extensions}
      content={defaultValue}
      onUpdate={onChange}
      editorContainerProps={{
        className: cn(
          'max-w-none text-foreground prose dark:prose-invert',
          size === 'sm' && 'prose-sm',
          size === 'md' && 'prose-base',
          size === 'lg' && 'prose-lg',
          className,
        ),
      }}
      editorProps={{
        attributes: {
          class: 'focus:outline-none',
        },
      }}
      editable={editable}
    >
      {children}
      {!editable && <ChangesListener value={defaultValue} />}
    </EditorProvider>
  );
};

export default BaseMarkdown;

// @blocks-registry markdown@1.0.0 — registry version, never edit this line