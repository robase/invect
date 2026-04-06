import 'react';

declare module 'react' {
  interface CSSProperties {
    WebkitTextSecurity?: 'none' | 'circle' | 'disc' | 'square';
  }
}
