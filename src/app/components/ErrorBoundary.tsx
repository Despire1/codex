import { Component, ErrorInfo, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return (
      <div className={styles.root} role="alert">
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden>
            ⚠️
          </div>
          <h1 className={styles.title}>Что-то пошло не так</h1>
          <p className={styles.description}>
            Мы уже знаем о проблеме. Попробуйте обновить страницу — чаще всего это помогает.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={this.handleReload}>
              Обновить страницу
            </button>
            <button type="button" className={styles.secondaryButton} onClick={this.reset}>
              Попробовать ещё раз
            </button>
          </div>
          {this.state.error.message ? (
            <details className={styles.details}>
              <summary>Техническая информация</summary>
              <pre className={styles.errorText}>{this.state.error.message}</pre>
            </details>
          ) : null}
        </div>
      </div>
    );
  }
}
