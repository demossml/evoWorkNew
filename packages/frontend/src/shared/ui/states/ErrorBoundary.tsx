import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Widget name for error identification */
  name?: string;
  /** Compact variant for dashboard widgets */
  variant?: "page" | "widget";
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  retry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const variant = this.props.variant || "page";

      if (variant === "widget") {
        return (
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/50 p-4 shadow-sm min-h-[80px] flex flex-col items-center justify-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400 text-center">
              {this.props.name || "Виджет"} не загрузился
            </span>
            <button
              onClick={this.retry}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 active:scale-95 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              Повторить
            </button>
          </div>
        );
      }

      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="text-red-500 dark:text-red-400 text-5xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Что-то пошло не так
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-xs">
            {this.state.error?.message || "Неизвестная ошибка"}
          </p>
          <button
            onClick={this.retry}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-all"
          >
            Попробовать снова
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
