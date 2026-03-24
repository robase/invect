import type { Extension } from '@codemirror/state';
import { vsCodeDark } from '@fsegurai/codemirror-theme-vscode-dark';
import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light';
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

const vscodeDarkPalette: CodeMirrorVscodePalette = {
  keyword: '#569cd6',
  operator: '#c586c0',
  variable: '#9cdcfe',
  string: '#ce9178',
  function: '#dcdcaa',
  comment: '#6a9955',
  error: '#f44747',
  surface: '#252526',
  surfaceAlt: '#2d2d30',
  border: '#3c3c3c',
  foreground: '#d4d4d4',
  foregroundMuted: '#838383',
  foregroundInverse: '#ffffff',
  accent: '#3794ff',
  accentHover: '#4daafc',
  selection: '#264f78',
};

const vscodeLightPalette: CodeMirrorVscodePalette = {
  keyword: '#0064ff',
  operator: '#af00db',
  variable: '#0070c1',
  string: '#a31515',
  function: '#795e26',
  comment: '#008000',
  error: '#e51400',
  surface: '#f3f3f3',
  surfaceAlt: '#ffffff',
  border: '#d6d6d6',
  foreground: '#383a42',
  foregroundMuted: '#6b6b6b',
  foregroundInverse: '#ffffff',
  accent: '#006ab1',
  accentHover: '#005a9c',
  selection: '#add6ff',
};

export function useCodeMirrorVscodeTheme(): Extension {
  const themeContext = useOptionalTheme();

  return themeContext?.resolvedTheme === 'dark' ? vsCodeDark : vsCodeLight;
}

export function useCodeMirrorVscodePalette(): CodeMirrorVscodePalette {
  const themeContext = useOptionalTheme();

  return themeContext?.resolvedTheme === 'dark' ? vscodeDarkPalette : vscodeLightPalette;
}
