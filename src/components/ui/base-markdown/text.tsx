import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

const textVariants = cva('', {
  variants: {
    variant: {
      'display-lg': 'text-6xl font-semibold',
      heading1: 'text-5xl font-medium',
      heading2: 'text-4xl font-medium',
      heading3: 'text-2xl font-medium',
      heading4: 'text-xl font-semibold',
      paragraph: 'text-base font-normal',
      blockquote: 'text-base font-semibold italic',
      large: 'text-lg font-semibold',
      'paragraph-medium': 'text-base font-medium',
      'paragraph-bold': 'text-base font-semibold',
      'inline-code': 'font-mono bg-secondary',
      small: 'text-sm font-normal',
      'small-medium': 'text-sm font-medium',
      'small-bold': 'text-sm font-semibold',
      detail: 'text-xs font-normal',
      'detail-medium': 'text-xs font-medium',
      'detail-bold': 'text-xs font-semibold',
    },
  },
  defaultVariants: {
    variant: 'paragraph', // Changed default to paragraph instead of primary-filled
  },
});

export type TextVariantsType = VariantProps<typeof textVariants>['variant'];

type AnyProps = Record<string, any>;

export type TextRenderProp =
  | React.ReactElement<AnyProps>
  | ((props: AnyProps) => React.ReactNode);

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof textVariants> {
  /** Radix-style composition (legacy `radix` apps): single element child becomes the tag. */
  asChild?: boolean;
  /** Base UI-style composition (`base` apps): element (or function) to render instead of the default tag. */
  render?: TextRenderProp;
}

// Local element-cloning composition, base-agnostic on purpose: this file installs into
// both `radix` and `base` apps, so it must not depend on @radix-ui/react-slot. Handlers
// chain (target element's first), styles merge, classNames join; the target element's
// other props win.
const mergeElementProps = (
  ownProps: AnyProps,
  childProps: AnyProps,
): AnyProps => {
  const merged: AnyProps = { ...ownProps, ...childProps };

  for (const propName in childProps) {
    const ownValue = ownProps[propName];
    const childValue = childProps[propName];

    if (/^on[A-Z]/.test(propName) && ownValue && childValue) {
      merged[propName] = (...args: unknown[]) => {
        const result = childValue(...args);
        ownValue(...args);
        return result;
      };
    } else if (propName === 'style') {
      merged[propName] = { ...ownValue, ...childValue };
    } else if (propName === 'className') {
      merged[propName] = [ownValue, childValue].filter(Boolean).join(' ');
    }
  }

  if (ownProps.ref && childProps.ref) {
    merged.ref = (node: unknown) => {
      for (const r of [ownProps.ref, childProps.ref]) {
        if (typeof r === 'function') {
          r(node);
        } else if (r != null) {
          (r as React.RefObject<unknown>).current = node;
        }
      }
    };
  }

  return merged;
};

const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ className, variant, asChild = false, render, ...props }, ref) => {
    const Comp = useMemo(() => {
      switch (variant) {
        case 'display-lg':
          return 'h1';
        case 'heading1':
          return 'h1';
        case 'heading2':
          return 'h2';
        case 'heading3':
          return 'h3';
        case 'heading4':
          return 'h4';
        case 'blockquote':
          return 'blockquote';
        case 'paragraph':
          return 'p';
        default:
          return 'span';
      }
    }, [variant]);

    const ownProps: AnyProps = {
      className: cn(textVariants({ variant, className })),
      ref,
      ...props,
    };

    if (render) {
      if (typeof render === 'function') {
        return render(ownProps);
      }

      return React.cloneElement(
        render,
        mergeElementProps(ownProps, (render.props ?? {}) as AnyProps),
      );
    }

    if (asChild) {
      const { children, ...rest } = ownProps;
      if (!React.isValidElement(children)) {
        return null;
      }

      return React.cloneElement(
        children,
        mergeElementProps(rest, (children.props ?? {}) as AnyProps),
      );
    }

    return <Comp {...ownProps} />;
  },
);
Text.displayName = 'Text';

export { Text, textVariants };

// @blocks-registry markdown@1.0.0 — registry version, never edit this line