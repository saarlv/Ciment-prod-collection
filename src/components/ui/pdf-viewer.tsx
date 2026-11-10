import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const FILE_DATA_BLOCK_PATTERN = /api\/blocks\/fileDataBlock\/[^/]+\/redirect/;
function isFileDataBlockRedirectUrl(url: string): boolean {
  return FILE_DATA_BLOCK_PATTERN.test(url);
}

function resolveFileUrl(file: string): string {
  if (!isFileDataBlockRedirectUrl(file)) {
    return file;
  }

  let token = localStorage.getItem('token');
  if ((window as any).appId) {
    const appToken = window.localStorage.getItem(
      `token-${(window as any).appId}`,
    );
    if (appToken) {
      token = appToken;
    }
  }

  return token ? `${file}?token=${token}` : file;
}

export interface PdfField {
  x: number;
  y: number;
  page: number;
  name: string;
  width?: number;
  height?: number;
  label?: string;
  type?: string;
}

export interface PdfViewerProps {
  file: string | File;
  fields?: PdfField[];
  /** Show overlays only for these field names. Ignored when `showAll` is true. */
  showFields?: string[];
  /** Show overlays for all fields. Defaults to false. */
  showAll?: boolean;
  /** Show field name labels above overlays. Defaults to false. */
  showLabels?: boolean;
  /** Show native PDF annotations (links, comments, etc.). Defaults to false. */
  showAnnotations?: boolean;
  /** Called when the displayed page changes. Receives the 1-based page number. */
  onPageChange?: (page: number) => void;
  /** Page to show (1-based): the document opens on it and jumps whenever it changes. */
  page?: number;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  zoomStep?: number;
}

interface PageNativeSize {
  pdfW: number;
  pdfH: number;
}

export const PdfViewer = ({
  file,
  fields = [],
  showFields,
  showAll = false,
  showLabels = false,
  showAnnotations = false,
  onPageChange,
  page,
  defaultWidth = 800,
  minWidth = 400,
  maxWidth = 1600,
  zoomStep = 100,
}: PdfViewerProps) => {
  const resolvedFile = typeof file === 'string' ? resolveFileUrl(file) : file;

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [width, setWidth] = useState(defaultWidth);
  const [pageInput, setPageInput] = useState('1');
  const [, setRenderTick] = useState(0);

  const nativeSizes = useRef<Map<number, PageNativeSize>>(new Map());

  const onDocumentLoadSuccess = ({
    numPages: loadedPages,
  }: {
    numPages: number;
  }) => {
    setNumPages(loadedPages);
    const start = page ? Math.max(1, Math.min(page, loadedPages || 1)) : 1;
    setCurrentPage(start);
    setPageInput(String(start));
  };

  const onPageLoadSuccess = (page: { pageNumber: number; view: number[] }) => {
    const { pageNumber } = page;
    if (!nativeSizes.current.has(pageNumber)) {
      const pdfW = page.view[2];
      const pdfH = page.view[3];
      if (typeof pdfW !== 'number' || typeof pdfH !== 'number') {
        return;
      }
      nativeSizes.current.set(pageNumber, { pdfW, pdfH });
      setRenderTick((tick) => tick + 1);
    }
  };

  const goToPage = (pageNumber: number) => {
    const clamped = Math.max(1, Math.min(pageNumber, numPages || 1));
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  };

  useEffect(() => {
    onPageChange?.(currentPage);
  }, [currentPage]);

  useEffect(() => {
    if (!page || numPages === 0) return;
    const clamped = Math.max(1, Math.min(page, numPages));
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  }, [page, numPages]);

  const handlePageInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      const value = Number.parseInt(pageInput, 10);
      if (!Number.isNaN(value)) {
        goToPage(value);
      }
    }
  };

  const handlePageInputBlur = () => {
    const value = Number.parseInt(pageInput, 10);
    if (!Number.isNaN(value)) {
      goToPage(value);
      return;
    }

    setPageInput(String(currentPage));
  };

  const zoomIn = () =>
    setWidth((current) => Math.min(current + zoomStep, maxWidth));
  const zoomOut = () =>
    setWidth((current) => Math.max(current - zoomStep, minWidth));
  const zoomReset = () => setWidth(defaultWidth);
  const zoomPct = Math.round((width / defaultWidth) * 100);

  const toPixel = (field: PdfField) => {
    const native = nativeSizes.current.get(field.page + 1);
    if (!native) {
      return null;
    }

    const scale = width / native.pdfW;
    const scaledFieldHeight =
      typeof field.height === 'number' ? field.height * scale : 0;
    const top = native.pdfH * scale - field.y * scale - scaledFieldHeight;

    return {
      left: field.x * scale,
      top,
      width: typeof field.width === 'number' ? field.width * scale : undefined,
      height:
        typeof field.height === 'number' ? field.height * scale : undefined,
    };
  };

  const visibleFieldNames = showAll
    ? null
    : showFields
      ? new Set(showFields)
      : null;

  const pageFields = fields.filter((field) => {
    if (field.page !== currentPage - 1) return false;
    if (showAll) return true;
    if (visibleFieldNames) return visibleFieldNames.has(field.name);
    return false;
  });

  const prevDisabled = currentPage <= 1;
  const nextDisabled = numPages === 0 || currentPage >= numPages;
  const zoomOutDisabled = width <= minWidth;
  const zoomInDisabled = width >= maxWidth;

  return (
    <div
      dir="ltr"
      className="flex h-full w-full flex-col overflow-hidden bg-background"
    >
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Previous page"
            aria-label="Previous page"
            onClick={() => goToPage(currentPage - 1)}
            disabled={prevDisabled}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1.5">
            <Input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onKeyDown={handlePageInputKeyDown}
              onBlur={handlePageInputBlur}
              className="h-7 w-10 border-none bg-background px-0 text-center text-xs shadow-sm"
            />
            <span className="text-xs text-muted-foreground">of {numPages}</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Next page"
            aria-label="Next page"
            onClick={() => goToPage(currentPage + 1)}
            disabled={nextDisabled}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={zoomOut}
            disabled={zoomOutDisabled}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>

          <span className="min-w-10 text-center text-xs font-medium text-muted-foreground">
            {zoomPct}%
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={zoomIn}
            disabled={zoomInDisabled}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Reset zoom"
            aria-label="Reset zoom"
            onClick={zoomReset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-5" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Download PDF"
            aria-label="Download PDF"
            onClick={() => {
              if (typeof resolvedFile === 'string') {
                const link = document.createElement('a');
                link.href = resolvedFile;
                link.download = '';
                link.target = '_blank';
                link.click();
              }
            }}
            disabled={typeof resolvedFile !== 'string'}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto bg-muted/30 p-4">
        <Document
          file={resolvedFile}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex h-64 w-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
          noData={
            <div className="flex h-64 w-full items-center justify-center">
              <FileWarning className="h-8 w-8 text-muted-foreground" />
            </div>
          }
          error={
            <div className="flex h-64 w-full flex-col items-center justify-center gap-2">
              <FileWarning className="h-8 w-8 text-destructive" />
              <div className="h-1 w-8 rounded-full bg-destructive/50" />
            </div>
          }
        >
          <div className="relative inline-block shadow-lg">
            <Page
              pageNumber={currentPage}
              width={width}
              onLoadSuccess={onPageLoadSuccess}
              renderAnnotationLayer={showAnnotations}
            />

            {pageFields.map((field, index) => {
              const pos = toPixel(field);
              if (!pos) {
                return null;
              }

              const hasSize =
                typeof pos.width === 'number' || typeof pos.height === 'number';

              return (
                <div
                  key={`${field.page}-${field.x}-${field.y}-${index}`}
                  className="pointer-events-none absolute"
                  style={{
                    left: pos.left,
                    top: pos.top,
                    width: pos.width,
                    height: pos.height,
                    transform: hasSize ? undefined : 'translate(-50%, -50%)',
                  }}
                >
                  {showLabels && (
                    <div className="absolute bottom-full start-0 mb-1 inline-block whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-primary-foreground shadow-sm">
                      {field.label ?? field.name ?? `(${field.x}, ${field.y})`}
                    </div>
                  )}
                  {hasSize && (
                    <div className="h-full w-full rounded border-2 border-primary bg-primary/10" />
                  )}
                </div>
              );
            })}
          </div>
        </Document>
      </div>
    </div>
  );
};

// @blocks-registry pdf-viewer@1.0.0 — registry version, never edit this line