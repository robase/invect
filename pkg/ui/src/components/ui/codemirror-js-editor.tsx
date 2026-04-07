import { useEffect, useRef, useMemo, useState } from 'react';
import {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightSpecialChars,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { EditorState, type Extension, Compartment } from '@codemirror/state';
import {
  javascript,
  localCompletionSource,
  scopeCompletionSource,
} from '@codemirror/lang-javascript';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete';
import { WrapText, WandSparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { cn } from '../../lib/utils';
import {
  CODEMIRROR_IOSEVKA_FONT_STACK,
  useCodeMirrorVscodePalette,
  useCodeMirrorVscodeTheme,
} from './codemirror-vscode-theme';

interface CodeMirrorJsEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Initial height in px (default: 320). */
  defaultHeight?: number;
  /** Minimum resize height in px (default: 120). */
  minHeight?: number;
  /** Maximum resize height in px (default: 600). */
  maxHeight?: number;
  /**
   * Input data available as variables in scope.
   * Top-level keys are variable names; nested object keys drive property completions.
   */
  inputData?: Record<string, unknown>;
  /** Hide the left gutter (line numbers / fold indicators). Default: false. */
  hideGutter?: boolean;
  /** Hide the top toolbar (word wrap, format buttons). Default: false. */
  hideToolbar?: boolean;
  /** Hide the bottom resize drag handle. Default: false. */
  hideResize?: boolean;
}

/**
 * Build property-path completions from a nested object.
 * Supports one level of nesting: `varName.propPrefix`.
 */
function getCompletions(
  inputData: Record<string, unknown>,
  context: CompletionContext,
): CompletionResult | null {
  // --- Property access: `varName.propPrefix` ---
  const propAccess = context.matchBefore(/[\w$][\w$]*\.[\w$]*/);
  if (propAccess) {
    const dotIdx = propAccess.text.indexOf('.');
    const objName = propAccess.text.slice(0, dotIdx);
    const prefix = propAccess.text.slice(dotIdx + 1);
    const from = propAccess.from + dotIdx + 1;

    const obj = inputData[objName];
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const options: Completion[] = Object.keys(obj as Record<string, unknown>)
        .filter((k) => !prefix || k.startsWith(prefix))
        .map((k) => ({ label: k, type: 'property' }));
      if (options.length > 0) {
        return { from, options };
      }
    }
    return null;
  }

  // --- Top-level variable name ---
  const word = context.matchBefore(/[\w$]+/);
  if (!word && !context.explicit) {
    return null;
  }

  const from = word?.from ?? context.pos;
  const prefix = word?.text ?? '';

  const allVars: Completion[] = [
    ...Object.keys(inputData).map((k) => ({
      label: k,
      type: 'variable',
      detail: 'input variable',
    })),
    { label: '$input', type: 'variable', detail: 'full input context' },
  ];

  const filtered = prefix ? allVars.filter((v) => v.label.startsWith(prefix)) : allVars;
  if (filtered.length === 0) {
    return null;
  }

  return { from, options: filtered };
}

export function CodeMirrorJsEditor({
  value,
  onChange,
  placeholder,
  className,
  defaultHeight = 320,
  minHeight = 120,
  maxHeight = 600,
  inputData,
  hideGutter = false,
  hideToolbar = false,
  hideResize = false,
}: CodeMirrorJsEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Word wrap — toggled via a Compartment so the editor isn't destroyed on change
  const wrapCompartmentRef = useRef(new Compartment());
  const [wordWrap, setWordWrap] = useState(true);
  const wordWrapRef = useRef(wordWrap);
  wordWrapRef.current = wordWrap;

  const [isFormatting, setIsFormatting] = useState(false);

  // Resize state — explicit pixel height controlled by drag
  const [editorHeight, setEditorHeight] = useState(defaultHeight);
  const dragStateRef = useRef<{ startY: number; startH: number } | null>(null);

  const cmTheme = useCodeMirrorVscodeTheme();
  const palette = useCodeMirrorVscodePalette();

  // Always reads latest inputData without recreating the editor
  const inputDataRef = useRef<Record<string, unknown>>(inputData ?? {});
  inputDataRef.current = inputData ?? {};

  // Stable completion source — reads inputData from ref at call time
  const inputDataCompletionSource = useMemo(
    () => (ctx: CompletionContext) => getCompletions(inputDataRef.current, ctx),
    [],
  );

  const baseExtensions = useMemo<Extension[]>(
    () => [
      javascript(),
      highlightActiveLine(),
      highlightSpecialChars(),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      ...(hideGutter ? [] : [foldGutter()]),
      history(),
      autocompletion({
        override: [
          localCompletionSource,
          scopeCompletionSource(globalThis),
          inputDataCompletionSource,
        ],
        activateOnTyping: true,
      }),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...closeBracketsKeymap,
        ...completionKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      }),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inputDataCompletionSource is stable (created once via useMemo)
    [placeholder, inputDataCompletionSource, hideGutter],
  );

  const themeExtension = useMemo(
    () =>
      EditorView.theme({
        '&': {
          fontFamily: CODEMIRROR_IOSEVKA_FONT_STACK,
          fontSize: '12px',
          height: '100%',
          '--cm-vscode-widget-surface': palette.surface,
          '--cm-vscode-widget-surface-alt': palette.surfaceAlt,
          '--cm-vscode-widget-border': palette.border,
          '--cm-vscode-widget-fg': palette.foreground,
          '--cm-vscode-widget-fg-muted': palette.foregroundMuted,
          '--cm-vscode-widget-fg-inverse': palette.foregroundInverse,
          '--cm-vscode-widget-accent': palette.accent,
          '--cm-vscode-widget-accent-hover': palette.accentHover,
          '--cm-vscode-widget-selection': palette.selection,
        },
        '.cm-scroller, .cm-content, .cm-gutters, .cm-tooltip': {
          fontFamily: CODEMIRROR_IOSEVKA_FONT_STACK,
        },
        '.cm-content': {
          padding: '8px 0',
          minHeight: hideGutter ? undefined : '120px',
        },
        '.cm-line': {
          padding: '0 8px',
        },
        '.cm-gutters': hideGutter ? { display: 'none' } : { minWidth: '28px' },
        '&.cm-focused': {
          outline: 'none',
        },
        '.cm-scroller': {
          overflow: 'auto',
          height: '100%',
        },
        '.cm-tooltip': {
          backgroundColor: palette.surface,
          border: `1px solid ${palette.border}`,
          color: palette.foreground,
          boxShadow: `0 6px 18px color-mix(in srgb, ${palette.border} 35%, transparent)`,
        },
        '.cm-tooltip-autocomplete ul li[aria-selected]': {
          backgroundColor: palette.selection,
          color: palette.foreground,
        },
        '.cm-completionLabel': {
          fontSize: '12px',
        },
        '.cm-completionMatchedText': {
          fontWeight: '600',
          textDecoration: 'none',
        },
        '.cm-completionDetail': {
          color: palette.foregroundMuted,
          fontSize: '11px',
        },
      }),
    [palette, hideGutter],
  );

  // Recreate editor when theme or base extensions change
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseExtensions,
        // Word wrap managed via Compartment so it can be toggled without recreating the editor
        wrapCompartmentRef.current.of(wordWrapRef.current ? EditorView.lineWrapping : []),
        cmTheme,
        themeExtension,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor is recreated intentionally on theme/extension changes
  }, [cmTheme, baseExtensions, themeExtension]);

  // Toggle word wrap dynamically via Compartment reconfiguration
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: wrapCompartmentRef.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  // Sync external value changes without recreating the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  const handleFormat = async () => {
    const view = viewRef.current;
    if (!view || isFormatting) {
      return;
    }
    setIsFormatting(true);
    try {
      const [{ format }, { default: pluginBabel }, { default: pluginEstree }] = await Promise.all([
        import('prettier/standalone'),
        import('prettier/plugins/babel'),
        import('prettier/plugins/estree'),
      ]);
      const current = view.state.doc.toString();
      const formatted = await format(current, {
        parser: 'babel',
        plugins: [pluginBabel, pluginEstree],
        semi: true,
        singleQuote: true,
        printWidth: 80,
        tabWidth: 2,
      });
      // Prettier adds a trailing newline — trim it for a clean editor value
      const trimmed = formatted.trimEnd();
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: trimmed },
      });
      onChangeRef.current?.(trimmed);
    } catch {
      // Silently ignore format errors (e.g. syntax errors in the code)
    } finally {
      setIsFormatting(false);
    }
  };

  const handleDragHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragStateRef.current = { startY: e.clientY, startH: editorHeight };
  };

  const handleDragHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) {
      return;
    }
    const delta = e.clientY - dragStateRef.current.startY;
    const next = Math.max(minHeight, Math.min(maxHeight, dragStateRef.current.startH + delta));
    setEditorHeight(next);
  };

  const handleDragHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    dragStateRef.current = null;
  };

  return (
    <div
      className={cn('border rounded-md overflow-hidden bg-background flex flex-col', className)}
      style={{ height: editorHeight }}
    >
      {/* Toolbar */}
      {!hideToolbar && (
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-muted/40 shrink-0">
          <div className="flex-1" />
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setWordWrap((w) => !w)}
                  className={cn(
                    'flex items-center justify-center w-5 h-5 rounded transition-colors',
                    wordWrap
                      ? 'text-foreground bg-muted'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <WrapText className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleFormat}
                  disabled={isFormatting}
                  className="flex items-center justify-center w-5 h-5 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                >
                  <WandSparkles className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Format code
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Editor — fills space between toolbar and resize handle */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />

      {/* Resize drag handle */}
      {!hideResize && (
        <div
          className="shrink-0 h-2 cursor-ns-resize flex items-center justify-center group select-none border-t border-border bg-muted/30 hover:bg-muted/60 transition-colors"
          onPointerDown={handleDragHandlePointerDown}
          onPointerMove={handleDragHandlePointerMove}
          onPointerUp={handleDragHandlePointerUp}
          onPointerCancel={handleDragHandlePointerUp}
        >
          {/* Grip dots */}
          <div className="flex gap-0.5 opacity-40 group-hover:opacity-70 transition-opacity">
            <div className="w-4 h-0.5 rounded-full bg-foreground" />
          </div>
        </div>
      )}
    </div>
  );
}
