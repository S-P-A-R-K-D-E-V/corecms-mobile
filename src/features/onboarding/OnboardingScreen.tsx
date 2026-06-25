import { useRef, useState } from 'react';
import { View, ScrollView, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text, Button, Pressable } from 'src/components/ui';
import { CheckInIllustration, CheckOutIllustration, type IllustrationProps } from 'src/components/illustrations';
import { spring } from 'src/theme/motion';
import { prefs, PrefKeys } from 'src/services/storage';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { t } from 'src/i18n';
import { cn } from 'src/components/ui/utils';

type Slide = { Illustration: React.FC<IllustrationProps>; title: string; desc: string };

const slides: Slide[] = [
  { Illustration: CheckOutIllustration, title: t('onboarding.slide0Title'), desc: t('onboarding.slide0Desc') },
  { Illustration: CheckInIllustration, title: t('onboarding.slide1Title'), desc: t('onboarding.slide1Desc') },
  { Illustration: CheckOutIllustration, title: t('onboarding.slide2Title'), desc: t('onboarding.slide2Desc') },
  { Illustration: CheckInIllustration, title: t('onboarding.slide3Title'), desc: t('onboarding.slide3Desc') },
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
        {slides.map((s, i) => (
          <View key={s.title} style={{ width }} className="flex-1 items-center justify-center px-8 gap-6">
            <MotiView
              animate={{ scale: index === i ? 1 : 0.84, opacity: index === i ? 1 : 0.4 }}
              transition={{ type: 'timing', duration: 320 }}
            >
              <s.Illustration size={210} />
            </MotiView>
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
            <MotiView
              key={i}
              animate={{ width: i === index ? 24 : 8 }}
              transition={{ type: 'spring', ...spring.soft }}
              className={cn('h-2 rounded-full', i === index ? 'bg-primary' : 'bg-line')}
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
