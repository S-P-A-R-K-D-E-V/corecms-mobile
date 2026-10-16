import { Children, isValidElement } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { useResponsive } from 'src/hooks/use-responsive';
import { cn } from '../ui/utils';
import { AppHeader } from './AppHeader';
import { PullRefresh } from './PullRefresh';

// Must stay in sync with PILL_H in src/app/(tabs)/_layout.tsx
const TAB_PILL_H = 72;

// Max width of the content column on tablet — a centered "reading width"
// column (like Settings/Mail on iPad) instead of stretching cards edge to
// edge across a 1024pt-wide screen.
const TABLET_CONTENT_MAX_WIDTH = 760;

export type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  /** Kéo để làm mới (linh vật Spark). Trả Promise thì chờ Promise; không thì theo `refreshing`. */
  onRefresh?: () => unknown;
  /**
   * Header đứng yên phía trên vùng cuộn (không bị kéo theo khi làm mới / cuộn). Màn cuộn có `AppHeader` là con đầu
   * tiên thì tự đưa lên đây — không cần truyền.
   */
  header?: React.ReactNode;
  edges?: Edge[];
  className?: string;
  contentClassName?: string;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  /**
   * Add bottom padding to clear the floating tab bar.
   * Defaults to true — pass false only for auth/onboarding/modal screens
   * that render outside the tab navigator.
   */
  tabBarInset?: boolean;
  /**
   * On tablet, center content in a max-width column instead of stretching
   * full-bleed. Defaults to true — pass false for screens that want to use
   * the full tablet width (e.g. a custom multi-pane layout).
   */
  centered?: boolean;
};

/** Tách AppHeader nếu nó là con đầu tiên (để đứng yên phía trên vùng cuộn). */
function splitHeader(children: React.ReactNode): { header: React.ReactNode; body: React.ReactNode[] } {
  const list = Children.toArray(children);
  const first = list[0];
  if (isValidElement(first) && first.type === AppHeader) return { header: first, body: list.slice(1) };
  return { header: null, body: list };
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  refreshing,
  onRefresh,
  header,
  edges = ['top', 'left', 'right'],
  className,
  contentClassName,
  contentContainerStyle,
  tabBarInset = true,
  centered = true,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const tabPadBottom = tabBarInset ? TAB_PILL_H + Math.max(insets.bottom, 8) + 12 : 0;
  const pad = padded ? 'p-4' : '';
  const useTabletColumn = isTablet && centered;
  const column = (node: React.ReactNode, flex?: boolean) =>
    useTabletColumn ? (
      <View style={{ ...(flex ? { flex: 1 } : null), width: '100%', maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center' }}>{node}</View>
    ) : (
      node
    );

  // Map edges prop → inset padding (replaces deprecated SafeAreaView)
  const edgeStyle = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };

  if (scroll) {
    const split = header ? { header: null, body: Children.toArray(children) } : splitHeader(children);
    const hoisted = split.header ? (
      <View className={cn('bg-bg dark:bg-bg-dark', padded ? 'px-4 pt-4 pb-1.5' : '')}>{column(split.header)}</View>
    ) : null;
    const content = column(split.body);
    const scrollProps: ScrollViewProps = {
      contentContainerStyle: [{ paddingBottom: tabPadBottom }, hoisted && padded ? { paddingTop: 10 } : null, contentContainerStyle],
      showsVerticalScrollIndicator: false,
      keyboardShouldPersistTaps: 'handled',
      automaticallyAdjustKeyboardInsets: true,
      keyboardDismissMode: 'interactive',
    };
    const contentClass = cn(pad, 'gap-3.5', contentClassName);

    return (
      <View style={[{ flex: 1 }, edgeStyle]} className={cn('bg-bg dark:bg-bg-dark', className)}>
        {header ?? hoisted}
        {onRefresh ? (
          <PullRefresh refreshing={refreshing} onRefresh={onRefresh}>
            {(pull) => (
              <Animated.ScrollView {...scrollProps} {...pull} contentContainerClassName={contentClass}>
                {content}
              </Animated.ScrollView>
            )}
          </PullRefresh>
        ) : (
          <ScrollView {...scrollProps} contentContainerClassName={contentClass}>
            {content}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={[{ flex: 1 }, edgeStyle]} className={cn('bg-bg dark:bg-bg-dark', className)}>
      {header ?? null}
      <View
        className={cn('flex-1', pad, contentClassName)}
        style={tabBarInset ? { paddingBottom: tabPadBottom } : undefined}
      >
        {column(children, true)}
      </View>
    </View>
  );
}
