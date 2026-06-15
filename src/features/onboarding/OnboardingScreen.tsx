import { useRef, useState } from 'react';
import { View, ScrollView, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text, Button, Icon, Pressable, type IconName } from 'src/components/ui';
import { prefs, PrefKeys } from 'src/services/storage';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { t } from 'src/i18n';
import { cn } from 'src/components/ui/utils';

type Slide = { icon: IconName; title: string; desc: string; accent: string };

const slides: Slide[] = [
  { icon: 'hand-wave', title: t('onboarding.slide0Title'), desc: t('onboarding.slide0Desc'), accent: 'bg-primary' },
  { icon: 'face-recognition', title: t('onboarding.slide1Title'), desc: t('onboarding.slide1Desc'), accent: 'bg-primary' },
  { icon: 'cash-multiple', title: t('onboarding.slide2Title'), desc: t('onboarding.slide2Desc'), accent: 'bg-secondary' },
  { icon: 'calendar-sync', title: t('onboarding.slide3Title'), desc: t('onboarding.slide3Desc'), accent: 'bg-info' },
];

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === slides.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  async function finish() {
    await prefs.setBool(PrefKeys.onboardingDone, true);
    track(AnalyticsEvent.OnboardingCompleted);
    router.replace('/');
  }

  function next() {
    if (isLast) return finish();
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-row justify-end px-4 pt-2">
        <Pressable onPress={finish} className="px-3 py-2">
          <Text tone="muted" className="font-semibold">{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        className="flex-1"
      >
        {slides.map((s) => (
          <View key={s.title} style={{ width }} className="flex-1 items-center justify-center px-8 gap-6">
            <View className={cn('w-32 h-32 rounded-3xl items-center justify-center', s.accent)}>
              <Icon name={s.icon} size={64} color="#FFFFFF" />
            </View>
            <View className="gap-3">
              <Text variant="title" className="text-2xl text-center">{s.title}</Text>
              <Text tone="muted" className="text-center text-[15px] leading-6">{s.desc}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="px-8 pb-6 gap-5">
        <View className="flex-row justify-center gap-2">
          {slides.map((_, i) => (
            <View
              key={i}
              className={cn('h-2 rounded-full', i === index ? 'w-6 bg-primary' : 'w-2 bg-line')}
            />
          ))}
        </View>
        <Button size="lg" onPress={next}>
          {isLast ? t('onboarding.start') : t('onboarding.next')}
        </Button>
      </View>
    </View>
  );
}
