declare module 'react-middle-ellipsis' {
  import { ReactNode } from 'react';

  interface MiddleEllipsisProps {
    children: ReactNode;
  }

  const MiddleEllipsis: React.ComponentType<MiddleEllipsisProps>;
  export default MiddleEllipsis;
}
