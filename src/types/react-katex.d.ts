declare module 'react-katex' {
  import type { FC, ReactNode } from 'react';

  export interface MathComponentProps {
    math?: string;
    children?: string;
    errorColor?: string;
    renderError?: (error: Error) => ReactNode;
  }

  export const InlineMath: FC<MathComponentProps>;
  export const BlockMath: FC<MathComponentProps>;
}
