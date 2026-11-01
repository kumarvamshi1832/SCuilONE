import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  moduleName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ErrorBoundary] Caught render error in ${this.props.moduleName || "Component"}:`,
      error,
      errorInfo
    );
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "32px",
            margin: "24px 0",
            borderRadius: "12px",
            background: "rgba(239, 68, 68, 0.05)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            boxSizing: "border-box",
            width: "100%",
          }}
          className="sw-error-boundary-card"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>⚠️</span>
            <h3
              style={{
                margin: 0,
                fontSize: "1.15rem",
                fontWeight: 700,
                color: "#ef4444",
              }}
            >
              Rendering Issue in {this.props.moduleName || "Module"}
            </h3>
          </div>
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "0.88rem",
              color: "#64748b",
              lineHeight: "1.5",
            }}
          >
            {this.state.error?.message ||
              "An unexpected error occurred while displaying this section. The application and navigation remain active."}
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="sw-btn-primary"
              style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              onClick={this.handleReset}
            >
              Retry
            </button>
            <button
              type="button"
              className="sw-btn-secondary"
              style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
