import { useCallback, useEffect, useRef, useMemo } from 'react';
import {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightSpecialChars,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from '@codemirror/autocomplete';
import { ScrollArea } from '../../../ui/scroll-area';
import { Label } from '../../../ui/label';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../ui/tooltip';
import { Play, Loader2, HelpCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  useCodeMirrorVscodeTheme,
  CODEMIRROR_IOSEVKA_FONT_STACK,
} from '../../../ui/codemirror-vscode-theme';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MapperConfig {
  enabled: boolean;
  expression: string;
  mode: 'auto' | 'iterate' | 'reshape';
  outputMode: 'array' | 'object' | 'first' | 'last' | 'concat';
  keyField?: string;
  // TODO: Move concurrency into the shared node settings panel.
  concurrency: number;
  onEmpty: 'skip' | 'error';
}

interface MapperPreviewResult {
  success: boolean;
  result?: unknown;
  resultType?: 'array' | 'object' | 'primitive';
  itemCount?: number;
  error?: string;
}

interface DataMapperPaneProps {
  /** Current mapper config from form state */
  value: MapperConfig | undefined;
  /** Called when any mapper field changes */
  onChange: (config: MapperConfig | undefined) => void;
  /** Available upstream variable names (for hints) */
  availableVariables?: string[];
  /** Callback to test the mapper expression against live data */
  onTestMapper?: (request: {
    expression: string;
    incomingData: Record<string, unknown>;
    mode?: 'auto' | 'iterate' | 'reshape';
  }) => void;
  /** Result from the last test */
  previewResult?: MapperPreviewResult | null;
  /** Whether test is in progress */
  isTestingMapper?: boolean;
  /** Current input data JSON for passing to the test API */
  inputData?: Record<string, unknown>;
  /** Portal container for dropdowns */
  portalContainer?: HTMLElement | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const _DEFAULT_MAPPER_CONFIG: MapperConfig = {
  enabled: true,
  expression: '',
  mode: 'auto',
  outputMode: 'array',
  concurrency: 1,
  onEmpty: 'skip',
};

const MODE_OPTIONS = [
  {
    value: 'auto',
    label: 'Auto',
    description: 'Infer from result: array → iterate, object → single',
  },
  { value: 'iterate', label: 'Iterate', description: 'Assert result is an array, fail otherwise' },
  { value: 'reshape', label: 'Reshape', description: 'Single execution, never iterate' },
] as const;

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function FieldTooltip({ content }: { content: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[250px] text-xs">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  JS Expression Editor (CodeMirror)                                  */
/* ------------------------------------------------------------------ */

function JsExpressionEditor({
  value,
  onChange,
  placeholderText,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholderText?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const cmTheme = useCodeMirrorVscodeTheme();

  // Stable extensions (created once)
  const baseExtensions = useMemo<Extension[]>(
    () => [
      javascript(),
      highlightActiveLine(),
      highlightSpecialChars(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      indentOnInput(),
      foldGutter(),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...closeBracketsKeymap,
        ...completionKeymap,
      ]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      ...(placeholderText ? [cmPlaceholder(placeholderText)] : []),
      EditorView.theme({
        '&': {
          fontFamily: CODEMIRROR_IOSEVKA_FONT_STACK,
          fontSize: '12px',
        },
        '.cm-content': {
          padding: '8px 0',
          minHeight: '80px',
        },
        '.cm-line': {
          padding: '0 8px',
        },
        '.cm-gutters': {
          minWidth: '28px',
        },
        '.cm-scroller': {
          overflow: 'auto',
        },
      }),
    ],
    [placeholderText],
  );

  // Recreate editor when theme changes (same pattern as CodeMirrorJsonEditor)
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: value,
      extensions: [...baseExtensions, cmTheme],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmTheme, baseExtensions]);

  // Sync external value changes (e.g., reset)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="border rounded-md overflow-hidden bg-background min-h-[80px] max-h-[200px]"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Preview Panel                                                      */
/* ------------------------------------------------------------------ */

function MapperPreview({
  result,
  isLoading,
  mode,
}: {
  result: MapperPreviewResult | null | undefined;
  isLoading: boolean;
  mode: 'auto' | 'iterate' | 'reshape';
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Evaluating…
      </div>
    );
  }

  if (!result) {
    return (
      <div className="px-3 py-2 text-xs italic text-muted-foreground">
        Write an expression and press Preview to see results.
      </div>
    );
  }

  if (!result.success) {
    return (
      <div className="flex items-start gap-2 px-3 py-2">
        <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
        <span className="font-mono text-xs break-all text-destructive">{result.error}</span>
      </div>
    );
  }

  const isArray = result.resultType === 'array';
  const willIterate = mode === 'iterate' || (mode === 'auto' && isArray);
  const itemCount = result.itemCount ?? 0;

  return (
    <div className="space-y-2">
      {/* Behavior summary */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
        <span className="text-xs">
          Returns:{' '}
          <Badge variant="secondary" className="text-[10px] px-1 py-0">
            {result.resultType}
          </Badge>
          {willIterate ? (
            <>
              {' '}
              — Node will execute <strong>{itemCount}</strong> time{itemCount !== 1 ? 's' : ''}
            </>
          ) : (
            <>
              {' '}
              — Node will execute <strong>once</strong> with mapped data
            </>
          )}
        </span>
      </div>

      {/* Abbreviated result preview */}
      <div className="px-3 pb-2">
        <pre className="text-[11px] font-mono text-muted-foreground bg-muted/50 rounded p-2 overflow-auto max-h-[120px] whitespace-pre-wrap break-all">
          {formatPreviewResult(result.result)}
        </pre>
      </div>
    </div>
  );
}

function formatPreviewResult(value: unknown): string {
  if (value === undefined || value === null) {
    return String(value);
  }
  try {
    const json = JSON.stringify(value, null, 2);
    // Truncate long outputs (show first ~60 lines)
    const lines = json.split('\n');
    if (lines.length > 60) {
      return lines.slice(0, 60).join('\n') + '\n… (' + lines.length + ' lines total)';
    }
    return json;
  } catch {
    return String(value);
  }
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function DataMapperPane({
  value,
  onChange,
  availableVariables = [],
  onTestMapper,
  previewResult,
  isTestingMapper = false,
  inputData,
  portalContainer: _portalContainer,
}: DataMapperPaneProps) {
  const enabled = value?.enabled ?? false;

  const updateField = useCallback(
    <K extends keyof MapperConfig>(key: K, newValue: MapperConfig[K]) => {
      if (!value) {
        return;
      }
      onChange({ ...value, [key]: newValue });
    },
    [value, onChange],
  );

  const handleTestPreview = useCallback(() => {
    if (!value?.expression || !onTestMapper) {
      return;
    }
    onTestMapper({
      expression: value.expression,
      incomingData: inputData ?? {},
      mode: value.mode,
    });
  }, [value, onTestMapper, inputData]);

  // Variable hints
  const variablesHint = useMemo(() => {
    if (availableVariables.length === 0) {
      return null;
    }
    return availableVariables.slice(0, 5).join(', ');
  }, [availableVariables]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Content */}
      <ScrollArea className="flex-1 h-full min-h-0">
        <div className="p-3 space-y-3 text-xs">
          {!enabled ? (
            <p className="text-muted-foreground">
              Enable the data mapper to transform or iterate over upstream data before this node
              executes.
            </p>
          ) : (
            <>
              {/* JS Expression Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium">Expression</Label>
                  <FieldTooltip content="JavaScript expression evaluated in a sandbox. Upstream node outputs are available as local variables. Return an array to iterate, or an object for a single run." />
                </div>
                <JsExpressionEditor
                  value={value?.expression ?? ''}
                  onChange={(v) => updateField('expression', v)}
                  placeholderText="users.filter(u => u.active)"
                />
                {variablesHint && (
                  <p className="text-[10px] text-muted-foreground">
                    Available: <span className="font-mono">{variablesHint}</span>
                  </p>
                )}
              </div>

              {/* Mode */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium">Mode</Label>
                  <FieldTooltip content="Auto: infer iterate/single from result type. Iterate: assert array result. Reshape: always single execution." />
                </div>
                <div className="flex gap-1">
                  {MODE_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={value?.mode === opt.value ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 px-2 text-[10px] flex-1"
                      onClick={() => updateField('mode', opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Preview</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 gap-1 text-[10px]"
                    onClick={handleTestPreview}
                    disabled={!value?.expression || isTestingMapper}
                  >
                    {isTestingMapper ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    Preview
                  </Button>
                </div>
                <div className="border rounded-md bg-muted/30 min-h-[60px]">
                  <MapperPreview
                    result={previewResult}
                    isLoading={isTestingMapper}
                    mode={value?.mode ?? 'auto'}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
