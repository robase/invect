import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { useOptionalTheme } from '../../contexts/ThemeProvider';

export const CODEMIRROR_IOSEVKA_FONT_STACK =
  '"Iosevka", var(--font-mono, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace)';

export interface CodeMirrorVscodePalette {
  keyword: string;
  operator: string;
  variable: string;
  string: string;
  function: string;
  comment: string;
  error: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  foregroundInverse: string;
  accent: string;
  accentHover: string;
  selection: string;
}

// ─── Dark Modern ────────────────────────────────────────────────────────────

const darkModernEditorTheme = EditorView.theme(
  {
    '&': {
      color: '#cccccc',
      backgroundColor: '#1f1f1f',
      fontSize: '13px',
      fontFamily: CODEMIRROR_IOSEVKA_FONT_STACK,
    },
    '.cm-content': { caretColor: '#aeafad', lineHeight: '1.5' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#aeafad', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#264f78',
    },
    '.cm-panels': { backgroundColor: '#252526', color: '#cccccc' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid #3c3c3c' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #3c3c3c' },
    '.cm-searchMatch': { backgroundColor: '#72a1ff59', outline: '1px solid #457dff' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#6199ff2f' },
    '.cm-activeLine': { backgroundColor: '#ffffff08' },
    '.cm-selectionMatch': { backgroundColor: '#72a1ff59' },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: '#ffffff15',
      outline: '1px solid #569cd690',
    },
    '.cm-gutters': {
      backgroundColor: '#1e1e1e',
      color: '#858585',
      border: 'none',
      borderRight: '1px solid #3c3c3c',
    },
    '.cm-activeLineGutter': { color: '#c6c6c6', backgroundColor: '#282828' },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: '#858585' },
    '.cm-tooltip': {
      border: '1px solid #454545',
      backgroundColor: '#252526',
      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      borderRadius: '4px',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': { backgroundColor: '#04395e', color: '#cccccc' },
    },
    '.cm-completionIcon': { color: '#569cd6' },
  },
  { dark: true },
);

const darkModernHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.moduleKeyword], color: '#569cd6' },
    { tag: [t.controlKeyword, t.operatorKeyword], color: '#c586c0' },
    { tag: t.operator, color: '#d4d4d4' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#dcdcaa' },
    { tag: [t.typeName, t.className, t.namespace], color: '#4ec9b0' },
    { tag: [t.propertyName, t.definition(t.propertyName)], color: '#9cdcfe' },
    { tag: [t.variableName, t.name], color: '#9cdcfe' },
    { tag: t.definition(t.variableName), color: '#9cdcfe' },
    { tag: [t.string, t.special(t.string)], color: '#ce9178' },
    { tag: t.number, color: '#b5cea8' },
    { tag: [t.bool, t.null], color: '#569cd6' },
    {
      tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
      color: '#6a9955',
      fontStyle: 'italic',
    },
    { tag: t.tagName, color: '#569cd6' },
    { tag: t.attributeName, color: '#9cdcfe' },
    { tag: t.attributeValue, color: '#ce9178' },
    { tag: [t.regexp, t.escape], color: '#d16969' },
    { tag: t.meta, color: '#569cd6' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.link, color: '#6a9955', textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#569cd6' },
    { tag: t.invalid, color: '#f44747', textDecoration: 'underline' },
  ]),
);

export const vsCodeDarkModern: Extension = [darkModernEditorTheme, darkModernHighlight];

// ─── Light Modern ───────────────────────────────────────────────────────────

const lightModernEditorTheme = EditorView.theme(
  {
    '&': {
      color: '#3b3b3b',
      backgroundColor: '#ffffff',
      fontSize: '13px',
      fontFamily: CODEMIRROR_IOSEVKA_FONT_STACK,
    },
    '.cm-content': { caretColor: '#3b3b3b', lineHeight: '1.5' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#3b3b3b', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#add6ff',
    },
    '.cm-panels': { backgroundColor: '#f3f3f3', color: '#3b3b3b' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid #e5e5e5' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #e5e5e5' },
    '.cm-searchMatch': { backgroundColor: '#f7c94399', outline: '1px solid #f7c943' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#f7c94366' },
    '.cm-activeLine': { backgroundColor: '#f8f8f8' },
    '.cm-selectionMatch': { backgroundColor: '#a8ac94a0' },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: '#0064ff20',
      outline: '1px solid #0064ff50',
    },
    '.cm-gutters': {
      backgroundColor: '#f8f8f8',
      color: '#6e7681',
      border: 'none',
      borderRight: '1px solid #e5e5e5',
    },
    '.cm-activeLineGutter': { color: '#3b3b3b', backgroundColor: '#f0f0f0' },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: '#6e7681' },
    '.cm-tooltip': {
      border: '1px solid #c8c8c8',
      backgroundColor: '#f3f3f3',
      boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
      borderRadius: '4px',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': { backgroundColor: '#d6ebff', color: '#3b3b3b' },
    },
    '.cm-completionIcon': { color: '#0064ff' },
  },
  { dark: false },
);

const lightModernHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.moduleKeyword], color: '#0000ff' },
    { tag: [t.controlKeyword, t.operatorKeyword], color: '#af00db' },
    { tag: t.operator, color: '#3b3b3b' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#795e26' },
    { tag: [t.typeName, t.className, t.namespace], color: '#267f99' },
    { tag: [t.propertyName, t.definition(t.propertyName)], color: '#0451a5' },
    { tag: [t.variableName, t.name], color: '#001080' },
    { tag: t.definition(t.variableName), color: '#001080' },
    { tag: [t.string, t.special(t.string)], color: '#a31515' },
    { tag: t.number, color: '#098658' },
    { tag: [t.bool, t.null], color: '#0000ff' },
    {
      tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
      color: '#008000',
      fontStyle: 'italic',
    },
    { tag: t.tagName, color: '#800000' },
    { tag: t.attributeName, color: '#e50000' },
    { tag: t.attributeValue, color: '#a31515' },
    { tag: [t.regexp, t.escape], color: '#811f3f' },
    { tag: t.meta, color: '#0000ff' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.link, color: '#008000', textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#0000ff' },
    { tag: t.invalid, color: '#cd3131', textDecoration: 'underline' },
  ]),
);

export const vsCodeLightModern: Extension = [lightModernEditorTheme, lightModernHighlight];

// ─── Palettes (used by other components for matching UI colors) ──────────────

const vscodeDarkPalette: CodeMirrorVscodePalette = {
  keyword: '#569cd6',
  operator: '#c586c0',
  variable: '#9cdcfe',
  string: '#ce9178',
  function: '#dcdcaa',
  comment: '#6a9955',
  error: '#f44747',
  surface: '#252526',
  surfaceAlt: '#1f1f1f',
  border: '#3c3c3c',
  foreground: '#cccccc',
  foregroundMuted: '#858585',
  foregroundInverse: '#ffffff',
  accent: '#3794ff',
  accentHover: '#4daafc',
  selection: '#264f78',
};

const vscodeLightPalette: CodeMirrorVscodePalette = {
  keyword: '#0000ff',
  operator: '#af00db',
  variable: '#001080',
  string: '#a31515',
  function: '#795e26',
  comment: '#008000',
  error: '#cd3131',
  surface: '#f8f8f8',
  surfaceAlt: '#ffffff',
  border: '#e5e5e5',
  foreground: '#3b3b3b',
  foregroundMuted: '#6e7681',
  foregroundInverse: '#ffffff',
  accent: '#0064ff',
  accentHover: '#0050cc',
  selection: '#add6ff',
};

export function useCodeMirrorVscodeTheme(): Extension {
  const themeContext = useOptionalTheme();

  return themeContext?.resolvedTheme === 'dark' ? vsCodeDarkModern : vsCodeLightModern;
}

export function useCodeMirrorVscodePalette(): CodeMirrorVscodePalette {
  const themeContext = useOptionalTheme();

  return themeContext?.resolvedTheme === 'dark' ? vscodeDarkPalette : vscodeLightPalette;
}
