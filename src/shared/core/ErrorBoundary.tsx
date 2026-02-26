import { Component, ReactNode } from 'react';
import MobileErrorScreen from '@/shared/ui/MobileErrorScreen';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    return this.state.hasError
      ? this.props.fallback || <MobileErrorScreen error={this.state.error} />
      : this.props.children;
  }
}