import { useEffect, useMemo, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, Keyboard, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';

import { Loading, goBackOrHome } from 'src/components/shared';
import { toast } from 'src/components/overlay';
import { Text, Pressable, Icon, Button } from 'src/components/ui';
import { prefs, PrefKeys } from 'src/services/storage';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { useT } from 'src/i18n';
import { useAuthContext, type AuthUser } from 'src/auth/auth-context';
import { getStorageUrl } from 'src/api/axios';
import { assistantEnabled, isManagerUser } from 'src/auth/roles';
import { getStore, isMultiStore } from 'src/services/store-config';
import { RichText, hasWideContent } from './RichText';
import { useAssistantCapabilities, useAssistantChat } from './use-assistant-chat';
import { isInFlight, type ScreenMessage } from './assistant-events';
import { normalizeBlocks } from './blocks';
import { ImageGrid, MessageBlocks, SuggestionChips, suggestionsOf } from './MessageBlocks';
import { StepList } from './StepList';
import { Composer } from './Composer';
import { imageRulesOf } from './image-attachments';

// ----------------------------------------------------------------------
// Tab "Trợ lý" — AI Chat, KHÁC HOÀN TOÀN tab "Chat" nhắn tin nội bộ. BE tự chọn trợ lý theo người hỏi:
//   - CiCi: nhân viên tự tra lương/lịch của riêng mình; admin tra số liệu cửa hàng (AI Gateway).
//   - Cửa hàng SaaS: chủ/quản lý tra số liệu của chính cửa hàng (core-be StoreAssistant, chỉ đọc).
// Trả lời stream qua SignalR (assistant-provider), lịch sử lấy qua REST — state + watchdog ở use-assistant-chat.
// GET /chatbot/capabilities (server mới) quyết định bật/tắt, tier và có cho gửi ảnh không; server cũ → như trước.
// ----------------------------------------------------------------------

// App Store 5.1.2(i): xin phép rõ ràng trước khi gửi dữ liệu cá nhân cho AI bên thứ ba. Đổi nội dung
// đồng ý (assistant.consentBody) theo cách làm người dùng phải đồng ý lại → tăng phiên bản.
// v2: ảnh người dùng gửi kèm cũng được gửi tới nhà cung cấp AI.
const AI_CONSENT_VERSION = 'v2';
/** Tier server mà trợ lý tra số liệu cửa hàng (gợi ý / chữ kiểu chủ cửa hàng). */
const OWNER_TIERS = ['cici_admin', 'store_admin', 'store_manager'];
// Khớp PILL_H + lề của thanh tab nổi (src/app/(tabs)/_layout.tsx) — ô nhập phải nằm TRÊN thanh tab.
const TAB_BAR_CLEARANCE = 72 + 8;

function TypingDots({ label }: { label?: string }) {
  return (
    <View className="flex-row items-center gap-2 py-1">
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
  );
}

type BubbleProps = {
  msg: ScreenMessage;
  user: AuthUser | null | undefined;
  /** Đang có câu trả lời chạy / đang gửi → khoá nút thao tác + chip gợi ý. */
  busy: boolean;
  /** Đây là câu trả lời cuối và đã xong → hiện chip gợi ý. */
  showSuggestions: boolean;
  /** Đang chờ mà im lặng lâu → "Vẫn đang xử lý…". */
  stale: boolean;
  onSend: (prompt: string) => void;
  onRetry?: (msg: ScreenMessage) => void;
};

function Bubble({ msg, user, busy, showSuggestions, stale, onSend, onRetry }: BubbleProps) {
  const t = useT();
  const isMine = msg.role === 'user';
  // Khối từ server vẫn kiểm lại theo người dùng hiện tại (route được phép, ảnh/link an toàn).
  const blocks = useMemo(() => (isMine ? [] : normalizeBlocks(msg.blocks, user)), [isMine, msg.blocks, user]);
  const suggestions = showSuggestions ? suggestionsOf(blocks) : [];
  const streaming = !!msg.streaming;
  const hasSteps = !!msg.steps?.length;
  const wide = !isMine && (blocks.some((b) => b.type !== 'suggestions') || hasWideContent(msg.content));
  // Ảnh người dùng gửi: bản trên máy (vừa gửi) hoặc đường dẫn media đã ký của server.
  const sentImages = isMine
    ? msg.localUris?.length
      ? msg.localUris
      : (msg.attachments ?? []).filter((a) => a.kind === 'image' && typeof a.url === 'string' && a.url).map((a) => getStorageUrl(a.url))
    : [];

  return (
    <View className={cn('my-0.5', isMine ? 'items-end' : 'items-start')}>
      <View
        className={cn(
          'px-3.5 py-2.5 rounded-2xl',
          wide ? 'w-[86%]' : sentImages.length ? 'w-[72%]' : 'max-w-[86%]',
          isMine ? 'bg-primary' : 'bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark'
        )}
      >
        {isMine ? (
          <View className="gap-1.5">
            {sentImages.length ? <ImageGrid uris={sentImages} /> : null}
            {msg.content ? <Text className="text-white">{msg.content}</Text> : null}
          </View>
        ) : (
          <>
            <StepList steps={msg.steps} streaming={streaming} hasText={!!msg.content} />
            {streaming && !msg.content && !hasSteps ? (
              <TypingDots label={msg.statusLabel ?? (stale ? t('assistant.stillWorking') : t('assistant.thinking'))} />
            ) : null}
            {msg.content ? <RichText text={msg.content} /> : null}
            {streaming && msg.content && stale ? (
              <Text variant="caption" tone="muted" className="mt-1">{t('assistant.stillWorking')}</Text>
            ) : null}
            {blocks.length ? <MessageBlocks blocks={blocks} busy={busy} onSend={onSend} /> : null}
            {msg.status === 'error' ? (
              // Lỗi giữa chừng: giữ phần đã trả lời, thêm dòng báo lỗi + Thử lại.
              <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1 mt-1.5">
                <Icon name="alert-circle-outline" size={15} tone="error" />
                <Text variant="bodySmall" tone="error">{t('assistant.replyFailed')}</Text>
                {onRetry ? (
                  <Pressable onPress={() => onRetry(msg)} disabled={busy} accessibilityRole="button" hitSlop={8}>
                    <Text variant="bodySmall" tone="primary" className="font-semibold underline">{t('assistant.retry')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        )}
        {streaming ? null : (
          <Text className={cn('text-[10px] text-right mt-1', isMine ? 'text-white/65' : 'text-faint')}>
            {dayjs(msg.createdAt).format('HH:mm')}
          </Text>
        )}
      </View>
      {suggestions.length ? (
        <View className="w-[86%]">
          <SuggestionChips items={suggestions} disabled={busy} onSend={onSend} />
        </View>
      ) : null}
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

/**
 * Câu hỏi gợi ý lúc chưa có tin: theo tier của capabilities (server mới), chưa có thì theo vai trò như cũ.
 * Quản lý cửa hàng không có công cụ tiền → bỏ câu doanh thu.
 */
export function starterQuestions(tier: string | null | undefined, ownerMode: boolean, tr: (k: string) => string): string[] {
  const owner = ['ownerQ1', 'ownerQ2', 'ownerQ3', 'ownerQ4'];
  const staff = ['staffQ1', 'staffQ2', 'staffQ3'];
  const keys =
    tier === 'cici_admin' || tier === 'store_admin'
      ? owner
      : tier === 'store_manager'
        ? owner.slice(1)
        : tier === 'cici_staff'
          ? staff
          : ownerMode
            ? owner
            : staff;
  return keys.map((k) => tr(`assistant.${k}`));
}

export function AssistantScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();

  const featureOn = assistantEnabled(user);
  const caps = useAssistantCapabilities(featureOn);
  const capabilities = caps.capabilities;
  // Server mới báo tắt (chưa cấu hình / gói không có / vai trò không dùng được) → không hiện ô soạn.
  const capsOff = capabilities?.enabled === false;
  const tier = capabilities?.tier;
  const ownerMode = tier ? OWNER_TIERS.includes(tier) : isManagerUser(user);
  const [consent, setConsent] = useState<boolean | null>(null);
  useEffect(() => {
    prefs.get(PrefKeys.aiConsent).then((v) => setConsent(v === AI_CONSENT_VERSION)).catch(() => setConsent(false));
  }, []);
  const enabled = featureOn && caps.loaded && !capsOff && consent === true;
  const storeName = capabilities?.storeName || getStore()?.name || getStore()?.code || '';
  const imageRules = useMemo(() => imageRulesOf(capabilities), [capabilities]);

  const { messages, loading, sending, sessionId, stale, open, send: sendMessage, retry } = useAssistantChat({ enabled });
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

  /** Gửi câu từ chip gợi ý / nút thao tác — không đụng bản nháp đang gõ. */
  async function sendPrompt(prompt: string) {
    if (sending) return;
    if ((await sendMessage(prompt)) !== 'sent') toast.error(t('assistant.error'));
  }

  const busy = sending || messages.some(isInFlight);
  const last = messages[messages.length - 1];
  // Chip gợi ý chỉ dưới câu trả lời CUỐI cùng, đã xong.
  const suggestionsFor = last && last.role === 'assistant' && !last.streaming && last.status !== 'error' ? last.id : null;
  const suggestions = starterQuestions(tier, ownerMode, t);
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

      {featureOn && caps.loaded && !capsOff && consent === false ? (
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
        featureOn && (!caps.loaded || (!capsOff && consent === null)) ? <Loading /> : (
        <View className="flex-1 items-center justify-center px-8 gap-3" style={{ paddingBottom: TAB_BAR_CLEARANCE }}>
          <View className="w-16 h-16 rounded-2xl items-center justify-center bg-primary-soft">
            <Icon name="robot-off-outline" size={32} tone="primary" />
          </View>
          <Text variant="title2" className="text-center">{t('assistant.notEnabledTitle')}</Text>
          <Text tone="muted" className="text-center leading-6">
            {capsOff && capabilities?.reason === 'role_not_allowed' ? t('assistant.managersOnly') : t('assistant.notEnabledDesc')}
          </Text>
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
              <Suggestions items={suggestions} onPick={sendPrompt} />
            </ScrollView>
          ) : (
            <FlatList
              data={[...messages].reverse()}
              keyExtractor={(m) => m.id}
              inverted
              contentContainerClassName="px-3 py-2"
              renderItem={({ item }) => (
                <Bubble
                  msg={item}
                  user={user}
                  busy={busy}
                  showSuggestions={item.id === suggestionsFor}
                  stale={stale && !!item.streaming}
                  onSend={sendPrompt}
                  onRetry={retry}
                />
              )}
              keyboardShouldPersistTaps="handled"
            />
          )}

          <Composer
            sessionId={sessionId}
            sending={sending}
            placeholder={ownerMode ? t('assistant.placeholder') : t('assistant.staffPlaceholder')}
            imageInput={!!capabilities?.imageInput}
            rules={imageRules}
            bottomPadding={kbUp ? 0 : Math.max(insets.bottom, 8) + TAB_BAR_CLEARANCE - 8}
            onSend={(content, attachments, localUris) => sendMessage(content, { attachments, localUris })}
          />
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
