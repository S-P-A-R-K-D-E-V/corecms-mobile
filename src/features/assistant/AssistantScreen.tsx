import { useEffect, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, TextInput, Keyboard, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';

import { Loading, goBackOrHome } from 'src/components/shared';
import { Text, Pressable, Icon, Spinner, Button } from 'src/components/ui';
import { prefs, PrefKeys } from 'src/services/storage';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { useT } from 'src/i18n';
import { useAuthContext } from 'src/auth/auth-context';
import { assistantEnabled, isManagerUser } from 'src/auth/roles';
import { getStore, isMultiStore } from 'src/services/store-config';
import { RichText } from './RichText';
import { useAssistantChat } from './use-assistant-chat';
import type { ScreenMessage } from './assistant-events';

// ----------------------------------------------------------------------
// Tab "Trợ lý" — AI Chat, KHÁC HOÀN TOÀN tab "Chat" nhắn tin nội bộ. BE tự chọn trợ lý theo người hỏi:
//   - CiCi: nhân viên tự tra lương/lịch của riêng mình; admin tra số liệu cửa hàng (AI Gateway).
//   - Cửa hàng SaaS: chủ/quản lý tra số liệu của chính cửa hàng (core-be StoreAssistant, chỉ đọc).
// Trả lời stream qua SignalR (assistant-provider), lịch sử lấy qua REST — state + watchdog ở use-assistant-chat.
// ----------------------------------------------------------------------

// App Store 5.1.2(i): xin phép rõ ràng trước khi gửi dữ liệu cá nhân cho AI bên thứ ba. Đổi nội dung
// đồng ý (assistant.consentBody) theo cách làm người dùng phải đồng ý lại → tăng phiên bản.
const AI_CONSENT_VERSION = 'v1';
// Khớp PILL_H + lề của thanh tab nổi (src/app/(tabs)/_layout.tsx) — ô nhập phải nằm TRÊN thanh tab.
const TAB_BAR_CLEARANCE = 72 + 8;

function TypingBubble({ label }: { label?: string }) {
  return (
    <View className="flex-row justify-start my-1">
      <View className="flex-row items-center gap-2 px-4 py-3 rounded-2xl bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark">
        {[0, 1, 2].map((i) => (
          <MotiView
            key={i}
            from={{ opacity: 0.3, translateY: 0 }}
            animate={{ opacity: 1, translateY: -3 }}
            transition={{ loop: true, repeatReverse: true, type: 'timing', duration: 420, delay: i * 140 }}
            // MotiView không nhận className (NativeWind) — kích thước/màu qua style.
            style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: brand.muted }}
          />
        ))}
        {label ? <Text variant="caption" tone="muted">{label}</Text> : null}
      </View>
    </View>
  );
}

function Bubble({ msg }: { msg: ScreenMessage }) {
  const t = useT();
  const isMine = msg.role === 'user';
  return (
    <View className={cn('flex-row my-0.5', isMine ? 'justify-end' : 'justify-start')}>
      <View
        className={cn(
          'max-w-[86%] px-3.5 py-2.5 rounded-2xl',
          isMine ? 'bg-primary' : 'bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark'
        )}
      >
        {isMine ? (
          <Text className="text-white">{msg.content}</Text>
        ) : msg.status === 'error' ? (
          // Lỗi giữa chừng: giữ phần đã trả lời, thêm dòng báo lỗi.
          <View className="gap-1">
            {msg.content ? <RichText text={msg.content} /> : null}
            <Text variant="bodySmall" tone="error">{t('assistant.error')}</Text>
          </View>
        ) : (
          <RichText text={msg.content || (msg.streaming ? '…' : '')} />
        )}
        <Text className={cn('text-[10px] text-right mt-1', isMine ? 'text-white/65' : 'text-faint')}>
          {dayjs(msg.createdAt).format('HH:mm')}
        </Text>
      </View>
    </View>
  );
}

function Suggestions({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2 justify-center">
      {items.map((q) => (
        <Pressable
          key={q}
          onPress={() => onPick(q)}
          className="px-3.5 py-2 rounded-full bg-primary-soft border border-primary/20"
        >
          <Text variant="bodySmall" tone="primary" className="font-semibold">{q}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function AssistantScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();

  const ownerMode = isManagerUser(user);
  const featureOn = assistantEnabled(user);
  const [consent, setConsent] = useState<boolean | null>(null);
  useEffect(() => {
    prefs.get(PrefKeys.aiConsent).then((v) => setConsent(v === AI_CONSENT_VERSION)).catch(() => setConsent(false));
  }, []);
  const enabled = featureOn && consent === true;
  const storeName = getStore()?.name ?? getStore()?.code ?? '';

  const { messages, loading, sending, sessionId, stale, open, send: sendMessage } = useAssistantChat({ enabled });
  const [text, setText] = useState('');
  const [kbUp, setKbUp] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => setKbUp(true));
    const h = Keyboard.addListener(hideEvt, () => setKbUp(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  async function send(raw: string) {
    const content = raw.trim();
    if (!content || sending) return;
    setText('');
    const ok = await sendMessage(content);
    if (!ok) setText(content);
  }

  const streamingLabel = messages.find((m) => m.streaming)?.statusLabel ?? (stale ? t('assistant.stillWorking') : undefined);
  const isAssistantTyping = messages.some((m) => m.streaming && !m.content);
  const suggestions = ownerMode
    ? [t('assistant.ownerQ1'), t('assistant.ownerQ2'), t('assistant.ownerQ3'), t('assistant.ownerQ4')]
    : [t('assistant.staffQ1'), t('assistant.staffQ2'), t('assistant.staffQ3')];
  const subtitle = ownerMode && storeName
    ? t('assistant.storeSubtitle', { store: storeName })
    : ownerMode && !isMultiStore
      ? t('assistant.emptyDesc')
      : t('assistant.staffSubtitle');

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2 pb-2 flex-row items-center gap-2 border-b border-line dark:border-line-dark">
        <Pressable onPress={goBackOrHome} accessibilityLabel={t('common.back')} className="w-9 h-10 -ml-2 items-center justify-center">
          <Icon name="chevron-left" size={26} tone="default" />
        </Pressable>
        <View className="w-9 h-9 items-center justify-center rounded-full bg-primary-soft">
          <Icon name="robot-happy-outline" size={20} tone="primary" />
        </View>
        <View className="flex-1">
          <Text variant="subtitle">{t('assistant.title')}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>{subtitle}</Text>
        </View>
        {enabled && messages.length > 0 ? (
          <Pressable
            onPress={() => open(true)}
            accessibilityLabel={t('assistant.newChat')}
            className="w-10 h-10 items-center justify-center rounded-full"
          >
            <Icon name="square-edit-outline" size={22} tone="muted" />
          </Pressable>
        ) : null}
      </View>

      {featureOn && consent === false ? (
        <ScrollView contentContainerClassName="flex-grow justify-center px-7 gap-4 py-8" contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + 16 }}>
          <View className="w-16 h-16 rounded-2xl items-center justify-center bg-primary-soft self-center">
            <Icon name="shield-lock-outline" size={30} tone="primary" />
          </View>
          <Text variant="title2" className="text-center">{t('assistant.consentTitle')}</Text>
          <Text tone="muted" className="text-center leading-6">{t('assistant.consentBody')}</Text>
          <Button
            size="lg"
            onPress={async () => {
              await prefs.set(PrefKeys.aiConsent, AI_CONSENT_VERSION).catch(() => {});
              setConsent(true);
            }}
          >
            {t('assistant.consentAgree')}
          </Button>
          <Button variant="ghost" action="neutral" size="sm" onPress={() => router.push('/legal?doc=privacy' as any)}>
            {t('assistant.consentPolicy')}
          </Button>
        </ScrollView>
      ) : !enabled ? (
        consent === null && featureOn ? <Loading /> : (
        <View className="flex-1 items-center justify-center px-8 gap-3" style={{ paddingBottom: TAB_BAR_CLEARANCE }}>
          <View className="w-16 h-16 rounded-2xl items-center justify-center bg-primary-soft">
            <Icon name="robot-off-outline" size={32} tone="primary" />
          </View>
          <Text variant="title2" className="text-center">{t('assistant.notEnabledTitle')}</Text>
          <Text tone="muted" className="text-center leading-6">{t('assistant.notEnabledDesc')}</Text>
        </View>
        )
      ) : (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          {loading ? (
            <Loading />
          ) : messages.length === 0 ? (
            <ScrollView contentContainerClassName="flex-grow items-center justify-center px-6 gap-4 py-8" keyboardShouldPersistTaps="handled">
              <View className="w-16 h-16 rounded-2xl items-center justify-center bg-primary-soft">
                <Icon name="creation" size={30} tone="primary" />
              </View>
              <Text variant="title2" className="text-center">
                {ownerMode ? t('assistant.emptyTitle') : t('assistant.staffEmptyTitle')}
              </Text>
              <Text tone="muted" className="text-center leading-6">
                {ownerMode ? t('assistant.emptyDesc') : t('assistant.staffEmptyDesc')}
              </Text>
              <Suggestions items={suggestions} onPick={send} />
            </ScrollView>
          ) : (
            <FlatList
              data={[...messages].reverse()}
              keyExtractor={(m) => m.id}
              inverted
              contentContainerClassName="px-3 py-2"
              ListHeaderComponent={isAssistantTyping ? <TypingBubble label={streamingLabel ?? t('assistant.thinking')} /> : null}
              renderItem={({ item }) => <Bubble msg={item} />}
              keyboardShouldPersistTaps="handled"
            />
          )}

          <View
            className="flex-row items-end gap-2 p-2 px-3 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark"
            style={{ paddingBottom: kbUp ? 8 : Math.max(insets.bottom, 8) + TAB_BAR_CLEARANCE }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={ownerMode ? t('assistant.placeholder') : t('assistant.staffPlaceholder')}
              placeholderTextColor={brand.faint}
              multiline
              maxLength={1000}
              editable={!!sessionId}
              className="flex-1 rounded-3xl px-4 py-2.5 text-[15px] text-ink dark:text-ink-dark bg-bg dark:bg-bg-dark max-h-32"
            />
            <Pressable
              onPress={() => send(text)}
              disabled={!text.trim() || sending}
              accessibilityLabel="Send"
              className="w-11 h-11 items-center justify-center rounded-full"
            >
              {sending ? <Spinner /> : <Icon name="send" size={24} tone={text.trim() ? 'primary' : 'faint'} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
