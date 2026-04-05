import { useState, useCallback, useRef, useEffect } from 'react';
import { ResizablePanel } from '../../../ui/resizable';
import { JsonPreviewPanel } from '../JsonPreviewPanel';
import {
  LogIn,
  Play,
  Loader2,
  ChevronDown,
  ChevronRight,
  Shuffle,
  GripHorizontal,
} from 'lucide-react';
import { Button } from '../../../ui/button';
import { Badge } from '../../../ui/badge';
import { Switch } from '../../../ui/switch';
import { cn } from '../../../../lib/utils';
import type { UpstreamSlot } from '../types';
import { DataMapperPane } from './DataMapperPane';

/* Re-export mapper types so NodeConfigPanel doesn't need to import from DataMapperPane */
interface MapperConfig {
  enabled: boolean;
  expression: string;
  mode: 'auto' | 'iterate' | 'reshape';
  outputMode: 'array' | 'object' | 'first' | 'last' | 'concat';
  keyField?: string;
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

interface InputPanelProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  isTestMode: boolean;
  onReset: () => void;
  /** Upstream slot metadata for inline run controls */
  upstreamSlots?: UpstreamSlot[];
  /** Called when user clicks the run/retry button for a slot */
  onRunSlot?: (slot: UpstreamSlot) => void;
  /** Run all unresolved slots */
  onRunAll?: () => void;
  /** Number of unresolved slots */
  unresolvedCount?: number;
  /** Whether any slot is currently loading */
  isAnyLoading?: boolean;
  /** Data mapper props */
  mapperValue?: MapperConfig;
  onMapperChange?: (config: MapperConfig | undefined) => void;
  mapperAvailableVariables?: string[];
  onTestMapper?: (request: {
    expression: string;
    incomingData: Record<string, unknown>;
    mode?: 'auto' | 'iterate' | 'reshape';
  }) => void;
  mapperPreviewResult?: MapperPreviewResult | null;
  isTestingMapper?: boolean;
  mapperInputData?: Record<string, unknown>;
  portalContainer?: HTMLElement | null;
}

export function InputPanel({
  value,
  onChange,
  error,
  isTestMode,
  onReset,
  upstreamSlots,
  onRunSlot,
  onRunAll,
  unresolvedCount = 0,
  isAnyLoading = false,
  mapperValue,
  onMapperChange,
  mapperAvailableVariables,
  onTestMapper,
  mapperPreviewResult,
  isTestingMapper,
  mapperInputData,
  portalContainer,
}: InputPanelProps) {
  const [mapperOpen, setMapperOpen] = useState(() => mapperValue?.enabled ?? false);
  const [mapperHeight, setMapperHeight] = useState(320);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousMapperEnabledRef = useRef(mapperValue?.enabled ?? false);
  const collapsedMapperHeight = 28;
  const resizeHandleHeight = 2;
  const minInputHeight = 160;
  const minExpandedMapperHeight = 180;

  const clampMapperHeight = useCallback((nextHeight: number) => {
    const containerHeight = containerRef.current?.clientHeight ?? 0;
    const maxMapperHeight = Math.max(
      minExpandedMapperHeight,
      containerHeight - minInputHeight - resizeHandleHeight,
    );

    return Math.min(Math.max(nextHeight, minExpandedMapperHeight), maxMapperHeight);
  }, []);

  const currentMapperHeight = mapperOpen ? clampMapperHeight(mapperHeight) : collapsedMapperHeight;

  const toggleMapperAccordion = useCallback(() => {
    if (mapperOpen) {
      setMapperOpen(false);
    } else {
      setMapperHeight((current) => clampMapperHeight(current));
      setMapperOpen(true);
    }
  }, [clampMapperHeight, mapperOpen]);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!mapperOpen) {
        return;
      }

      const startY = event.clientY;
      const startHeight = currentMapperHeight;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaY = startY - moveEvent.clientY;
        setMapperHeight(clampMapperHeight(startHeight + deltaY));
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [clampMapperHeight, currentMapperHeight, mapperOpen],
  );

  // Opening the switch should expand the panel, but disabling it should not force-close it.
  useEffect(() => {
    const wasEnabled = previousMapperEnabledRef.current;
    const isEnabled = mapperValue?.enabled ?? false;

    if (!wasEnabled && isEnabled) {
      if (!mapperOpen) {
        setMapperHeight((current) => clampMapperHeight(current));
        setMapperOpen(true);
      }
    }

    previousMapperEnabledRef.current = isEnabled;
  }, [clampMapperHeight, mapperOpen, mapperValue?.enabled]);

  const hasMapper = !!onMapperChange;

  return (
    <ResizablePanel defaultSize={25} minSize={15} className="h-full">
      {hasMapper ? (
        <div ref={containerRef} className="flex flex-col h-full min-h-0">
          <div
            className="min-h-0"
            style={{
              height: mapperOpen
                ? `calc(100% - ${currentMapperHeight + resizeHandleHeight}px)`
                : `calc(100% - ${collapsedMapperHeight}px)`,
            }}
          >
            <JsonPreviewPanel
              title="Input"
              value={value}
              onChange={onChange}
              error={error}
              disableLinting
              isTestMode={isTestMode}
              onReset={onReset}
              upstreamSlots={upstreamSlots}
              onRunSlot={onRunSlot}
              icon={<LogIn className="w-3.5 h-3.5 text-muted-foreground" />}
              toolbarExtra={
                onRunAll ? (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] gap-0.5 font-semibold"
                    onClick={onRunAll}
                    disabled={isAnyLoading || unresolvedCount === 0}
                    title={
                      unresolvedCount > 0
                        ? `Run all ${unresolvedCount} unresolved upstream node${unresolvedCount > 1 ? 's' : ''}`
                        : 'No upstream nodes to run'
                    }
                  >
                    {isAnyLoading ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Play className="w-2.5 h-2.5" />
                    )}
                    Run all
                  </Button>
                ) : null
              }
            />
          </div>

          {mapperOpen ? (
            <div
              className="relative flex items-center justify-center h-0.5 bg-border shrink-0 cursor-row-resize after:absolute after:left-0 after:top-1/2 after:h-1 after:w-full after:-translate-y-1/2"
              onPointerDown={handleResizeStart}
            >
              <div className="z-10 flex items-center justify-center w-6 h-4 border opacity-100 bg-primary-foreground rounded-xs">
                <GripHorizontal className="size-2.5" />
              </div>
            </div>
          ) : null}

          <div
            className="min-h-0 border-border bg-background"
            style={{ height: `${currentMapperHeight}px` }}
          >
            <div className="flex flex-col h-full min-h-0">
              <div
                className="flex items-center justify-between px-3 transition-colors cursor-pointer select-none h-7 shrink-0 hover:bg-muted/60"
                onClick={toggleMapperAccordion}
              >
                <div className="flex items-center gap-1.5">
                  {mapperOpen ? (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                  <Shuffle
                    className={cn(
                      'w-3 h-3',
                      mapperValue?.enabled ? 'text-primary' : 'text-muted-foreground',
                    )}
                  />
                  <span className="text-[11px] font-medium">Data Mapper</span>
                  {mapperValue?.enabled && mapperValue?.expression ? (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                      Active
                    </Badge>
                  ) : null}
                </div>
                {onMapperChange ? (
                  <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                    <Switch
                      checked={mapperValue?.enabled ?? false}
                      onChange={() => {
                        if (mapperValue?.enabled) {
                          onMapperChange(undefined);
                        } else {
                          onMapperChange({
                            enabled: true,
                            expression: '',
                            mode: 'auto',
                            outputMode: 'array',
                            concurrency: 1,
                            onEmpty: 'skip',
                          });
                        }
                      }}
                      aria-label="Enable data mapper"
                    />
                  </div>
                ) : null}
              </div>

              {mapperOpen ? (
                <div className="flex-1 min-h-0">
                  <DataMapperPane
                    value={mapperValue}
                    // oxlint-disable-next-line typescript/no-non-null-assertion -- only rendered when mapper is open
                    onChange={onMapperChange!}
                    availableVariables={mapperAvailableVariables}
                    onTestMapper={onTestMapper}
                    previewResult={mapperPreviewResult}
                    isTestingMapper={isTestingMapper}
                    inputData={mapperInputData}
                    portalContainer={portalContainer}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        /* Fallback: no mapper support — just show input */
        <JsonPreviewPanel
          title="Input"
          value={value}
          onChange={onChange}
          error={error}
          disableLinting
          isTestMode={isTestMode}
          onReset={onReset}
          upstreamSlots={upstreamSlots}
          onRunSlot={onRunSlot}
          icon={<LogIn className="w-3.5 h-3.5 text-muted-foreground" />}
          toolbarExtra={
            onRunAll ? (
              <Button
                variant="default"
                size="sm"
                className="h-5 px-1.5 text-[10px] gap-0.5 font-semibold"
                onClick={onRunAll}
                disabled={isAnyLoading || unresolvedCount === 0}
                title={
                  unresolvedCount > 0
                    ? `Run all ${unresolvedCount} unresolved upstream node${unresolvedCount > 1 ? 's' : ''}`
                    : 'No upstream nodes to run'
                }
              >
                {isAnyLoading ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Play className="w-2.5 h-2.5" />
                )}
                Run all
              </Button>
            ) : null
          }
        />
      )}
    </ResizablePanel>
  );
}
