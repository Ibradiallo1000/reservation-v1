// src/ErrorBoundary.tsx
import React from 'react';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("❌ Erreur capturée dans ErrorBoundary :", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <h2 style={{ color: 'red' }}>Une erreur est survenue dans App.tsx</h2>;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
