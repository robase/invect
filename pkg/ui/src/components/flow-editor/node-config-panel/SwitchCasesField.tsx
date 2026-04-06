import { useCallback } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Plus, Trash2, ArrowUp, ArrowDown, Lock } from 'lucide-react';
import { toReferenceId } from '../../../utils/nodeReferenceUtils';
import { useFlowEditorStore } from '../flow-editor.store';
import { CodeMirrorJsEditor } from '../../ui/codemirror-js-editor';

interface SwitchCase {
  slug: string;
  label: string;
  expression: string;
}

interface SwitchCasesFieldProps {
  value: unknown;
  onChange: (value: SwitchCase[]) => void;
  nodeId: string | null;
  inputData?: Record<string, unknown>;
}

/**
 * Custom field renderer for the switch node's `cases` parameter.
 * Renders an ordered list of cases, each with a label, slug, and JS expression.
 * The default branch is always shown at the bottom and cannot be removed.
 */
export function SwitchCasesField({ value, onChange, nodeId, inputData }: SwitchCasesFieldProps) {
  const removeEdgesBySourceHandle = useFlowEditorStore((s) => s.removeEdgesBySourceHandle);
  const edges = useFlowEditorStore((s) => s.edges);

  const cases: SwitchCase[] = Array.isArray(value) ? (value as SwitchCase[]) : [];

  const hasEdgesForHandle = useCallback(
    (slug: string) => {
      if (!nodeId) {
        return false;
      }
      return edges.some((e) => e.source === nodeId && e.sourceHandle === slug);
    },
    [nodeId, edges],
  );

  const generateUniqueSlug = useCallback((label: string, existingSlugs: Set<string>) => {
    let base = toReferenceId(label);
    if (!base) {
      base = 'case';
    }
    if (base === 'default') {
      base = 'case_default';
    }

    let slug = base;
    let counter = 2;
    while (existingSlugs.has(slug)) {
      slug = `${base}_${counter}`;
      counter++;
    }
    return slug;
  }, []);

  const handleAddCase = useCallback(() => {
    const existingSlugs = new Set(cases.map((c) => c.slug));
    existingSlugs.add('default');
    const index = cases.length;
    const label = `Case ${index}`;
    const slug = generateUniqueSlug(label, existingSlugs);
    onChange([...cases, { slug, label, expression: '' }]);
  }, [cases, onChange, generateUniqueSlug]);

  const handleRemoveCase = useCallback(
    (index: number) => {
      const removed = cases[index];
      if (removed && nodeId) {
        removeEdgesBySourceHandle(nodeId, removed.slug);
      }
      onChange(cases.filter((_, i) => i !== index));
    },
    [cases, onChange, nodeId, removeEdgesBySourceHandle],
  );

  const handleUpdateCase = useCallback(
    (index: number, field: keyof SwitchCase, val: string) => {
      const updated = [...cases];
      const existing = updated[index];
      if (!existing) {
        return;
      }

      if (field === 'label') {
        const hasEdges = hasEdgesForHandle(existing.slug);
        if (!hasEdges) {
          // Auto-update slug when label changes and no edges are connected
          const existingSlugs = new Set(cases.map((c, i) => (i === index ? '' : c.slug)));
          existingSlugs.add('default');
          existingSlugs.delete('');
          const newSlug = generateUniqueSlug(val, existingSlugs);
          updated[index] = { ...existing, label: val, slug: newSlug };
        } else {
          updated[index] = { ...existing, label: val };
        }
      } else {
        updated[index] = { ...existing, [field]: val };
      }

      onChange(updated);
    },
    [cases, onChange, hasEdgesForHandle, generateUniqueSlug],
  );

  const handleMoveCase = useCallback(
    (index: number, direction: -1 | 1) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= cases.length) {
        return;
      }
      const updated = [...cases];
      const temp = updated[index];
      updated[index] = updated[newIndex]!;
      updated[newIndex] = temp!;
      onChange(updated);
    },
    [cases, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">Cases</Label>

      {cases.map((c, index) => (
        <div
          key={c.slug}
          className="flex flex-col gap-1.5 p-2 rounded-md border border-border bg-muted/30"
        >
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground font-mono w-4 shrink-0">
              {index + 1}.
            </span>
            <Input
              className="h-6 text-xs flex-1"
              value={c.label}
              onChange={(e) => handleUpdateCase(index, 'label', e.target.value)}
              placeholder="Case label"
            />
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => handleMoveCase(index, -1)}
                disabled={index === 0}
                title="Move up"
              >
                <ArrowUp className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => handleMoveCase(index, 1)}
                disabled={index === cases.length - 1}
                title="Move down"
              >
                <ArrowDown className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                onClick={() => handleRemoveCase(index)}
                title="Remove case"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono pl-5">
            slug: {c.slug}
            {hasEdgesForHandle(c.slug) && (
              <Lock className="inline-block w-2.5 h-2.5 ml-1 opacity-50" />
            )}
          </div>
          <div className="pl-5">
            <CodeMirrorJsEditor
              value={c.expression}
              onChange={(val) => handleUpdateCase(index, 'expression', val)}
              placeholder='priority === "high"'
              inputData={inputData}
            />
          </div>
        </div>
      ))}

      {/* Default branch — always present, not removable */}
      <div className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/20">
        <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">Default — matches when no case does</span>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={handleAddCase}
        disabled={cases.length >= 20}
      >
        <Plus className="w-3 h-3" />
        Add Case
      </Button>
    </div>
  );
}
