declare module '@/components/PageLoader' {
  import { FC } from 'react';
  interface PageLoaderProps {
    fullScreen?: boolean;
  }
  export const PageLoader: FC<PageLoaderProps>;
}