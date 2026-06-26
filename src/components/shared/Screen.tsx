import { ScrollView, View, RefreshControl, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { brand } from 'src/theme';
import { cn } from '../ui/utils';

// Must stay in sync with PILL_H in src/app/(tabs)/_layout.tsx
const TAB_PILL_H = 72;

export type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
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
};

export function Screen({
  children,
  scroll = false,
  padded = true,
  refreshing,
  onRefresh,
  edges = ['top'],
  className,
  contentClassName,
  contentContainerStyle,
  tabBarInset = true,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const tabPadBottom = tabBarInset ? TAB_PILL_H + Math.max(insets.bottom, 8) + 12 : 0;
  const pad = padded ? 'p-4' : '';

  // Map edges prop → inset padding (replaces deprecated SafeAreaView)
  const edgeStyle = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };

  if (scroll) {
    return (
      <View style={[{ flex: 1 }, edgeStyle]} className={cn('bg-bg dark:bg-bg-dark', className)}>
        <ScrollView
          contentContainerStyle={[{ paddingBottom: tabPadBottom }, contentContainerStyle]}
          contentContainerClassName={cn(pad, 'gap-3.5', contentClassName)}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                colors={[brand.primary]}
                tintColor={brand.primary}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[{ flex: 1 }, edgeStyle]} className={cn('bg-bg dark:bg-bg-dark', className)}>
      <View
        className={cn('flex-1', pad, contentClassName)}
        style={tabBarInset ? { paddingBottom: tabPadBottom } : undefined}
      >
        {children}
      </View>
    </View>
  );
}
