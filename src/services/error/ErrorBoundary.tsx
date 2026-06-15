import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorView } from 'src/components/shared';
import { createLogger } from '../logger';

const log = createLogger('error-boundary');

type Props = { children: ReactNode };
type State = { hasError: boolean };

function ErrorScreen({ onReset }: { onReset: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-1 items-center justify-center">
        <ErrorView
          title="Ứng dụng gặp sự cố"
          message="Đã có lỗi không mong muốn. Vui lòng thử lại."
          onRetry={onReset}
        />
      </View>
    </View>
  );
}

/** App-wide error boundary — catches render-time crashes and offers a reset. */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: unknown) {
    log.error('uncaught render error', error, info);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) return <ErrorScreen onReset={this.reset} />;
    return this.props.children;
  }
}
