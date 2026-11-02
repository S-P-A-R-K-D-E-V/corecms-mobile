import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { acknowledgeAnnouncement, getPendingAnnouncements, markAnnouncementSeen, type IPendingAnnouncement } from 'src/api/announcements';
import { useAuthContext } from 'src/auth/auth-context';
import { toast } from 'src/components/overlay';
import { Button, GlassView, Icon, Text, cn, type IconName } from 'src/components/ui';
import { openInAppBrowser } from 'src/features/assistant/links';
import { t } from 'src/i18n';
import { useCounterMode } from 'src/services/counter-mode';
import { getStoreCode, getWebOrigin, isMultiStore, storeDomain } from 'src/services/store-config';
import { blur, brand } from 'src/theme';
import { BrandScope } from 'src/theme/BrandScope';

import { AnnouncementImage, ZoomedAnnouncementImage, type ZoomedImage } from './AnnouncementImage';
import {
  announcementBlocks,
  announcementCta,
  isAnnouncementPush,
  mergeQueue,
  needsDetail,
  plainSpans,
  scrollMaxHeight,
  shouldCheck,
} from './announcement-logic';

// ----------------------------------------------------------------------
// Popup thông báo trên app: hỏi API khi mở app, khi quay lại app (có giãn cách) và khi có push thông báo. Hiện lần lượt từng cái. Bắt buộc
// xác nhận thì chỉ đóng được bằng nút "Đã hiểu". Lỗi tải (cửa hàng không có gói, mạng) bỏ qua: popup không được cản việc đang làm. Máy
// quầy không hiện. Đặt trong AuthProvider.
// ----------------------------------------------------------------------

const STORE_ROLES = ['Admin', 'Manager', 'Staff'];

const SEVERITY: Record<string, { icon: IconName; color: string; action: 'primary' | 'error' }> = {
  Info: { icon: 'information', color: brand.info, action: 'primary' },
  Warn: { icon: 'alert', color: brand.warning, action: 'primary' },
  Critical: { icon: 'alert-circle', color: brand.error, action: 'error' },
};

function Inline({ text, className }: { text: string; className?: string }) {
  return (
    <Text className={className}>
      {plainSpans(text).map((s, i) => (
        <Text key={i} className={cn(s.bold && 'font-bold', s.italic && 'italic', s.code && 'font-mono text-[13px]')}>
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

function Body({ markdown }: { markdown: string }) {
  return (
    <View className="gap-2">
      {announcementBlocks(markdown).map((block, i) => {
        switch (block.type) {
          case 'heading':
            return <Inline key={i} text={block.text} className="font-bold text-[16px]" />;
          case 'bullet':
          case 'numbered':
            return (
              <View key={i} className="flex-row" style={{ paddingLeft: block.depth * 12 }}>
                <Text className="mr-1.5">{block.type === 'bullet' ? '•' : `${block.n}.`}</Text>
                <View className="flex-1">
                  <Inline text={block.text} />
                </View>
              </View>
            );
          case 'quote':
            return (
              <View key={i} className="border-l-2 border-line dark:border-line-dark pl-2.5">
                <Inline text={block.text} />
              </View>
            );
          case 'code':
            return (
              <Text key={i} className="font-mono text-[13px]">
                {block.text}
              </Text>
            );
          case 'table':
            return (
              <View key={i} className="gap-1">
                {[block.header, ...block.rows].map((row, r) => (
                  <Inline key={r} text={row.join(' | ')} className={r === 0 ? 'font-bold' : undefined} />
                ))}
              </View>
            );
          case 'rule':
            return <View key={i} className="h-px bg-line dark:bg-line-dark" />;
          default:
            return <Inline key={i} text={block.text} />;
        }
      })}
    </View>
  );
}

export function AnnouncementHost() {
  const { user } = useAuthContext();
  const counter = useCounterMode((s) => s.device);
  const { height } = useWindowDimensions();
  const isStaff = !!user?.roles?.some((r) => STORE_ROLES.includes(r));
  // Đổi cửa hàng = hàng đợi khác, kể cả khi id người dùng trùng nhau.
  const sessionKey = user && isStaff && !counter ? `${getStoreCode() ?? 'app'}:${user.id}` : null;

  const [queue, setQueue] = useState<IPendingAnnouncement[]>([]);
  const [busy, setBusy] = useState(false);
  const [zoomed, setZoomed] = useState<ZoomedImage | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const lastCheckAt = useRef(0);
  const handled = useRef(new Set<string>());
  const seenSent = useRef(new Set<string>());
  const session = useRef<string | null>(null);
  session.current = sessionKey;

  const check = useCallback(
    (force: boolean) => {
      if (!sessionKey) return;
      const now = Date.now();
      if (!force && !shouldCheck(lastCheckAt.current, now)) return;
      lastCheckAt.current = now;
      getPendingAnnouncements()
        .then((list) => {
          // Đã đổi cửa hàng trong lúc chờ: kết quả này của cửa hàng cũ.
          if (session.current === sessionKey) setQueue((current) => mergeQueue(current, list, handled.current));
        })
        .catch(() => {});
    },
    [sessionKey]
  );

  useEffect(() => {
    lastCheckAt.current = 0;
    handled.current = new Set();
    seenSent.current = new Set();
    setQueue([]);
    check(true);
  }, [sessionKey, check]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') check(false);
    });
    const received = Notifications.addNotificationReceivedListener((notification) => {
      if (isAnnouncementPush(notification.request.content.data)) check(true);
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isAnnouncementPush(response.notification.request.content.data)) check(true);
    });
    return () => {
      appState.remove();
      received.remove();
      tapped.remove();
    };
  }, [check]);

  const current = queue[0] ?? null;
  const currentId = current?.id;

  useEffect(() => {
    if (!currentId || seenSent.current.has(currentId)) return;
    seenSent.current.add(currentId);
    markAnnouncementSeen(currentId).catch(() => {});
  }, [currentId]);

  const finish = useCallback((id: string) => {
    setZoomed(null);
    setDetailOpen(false);
    handled.current.add(id);
    setQueue((list) => list.filter((a) => a.id !== id));
  }, []);

  /** true = xong, đi tiếp được. Thông báo đã bị xoá (404, interceptor trả body có status) coi như xong. */
  const acknowledge = useCallback(
    async (announcement: IPendingAnnouncement): Promise<boolean> => {
      setBusy(true);
      try {
        await acknowledgeAnnouncement(announcement.id);
        finish(announcement.id);
        return true;
      } catch (err: any) {
        if (!announcement.requireAck || err?.status === 404) {
          finish(announcement.id);
          return true;
        }
        toast.error(t('announcement.ackFailed'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [finish]
  );

  if (!current) return null;

  const severity = SEVERITY[current.severity] ?? SEVERITY.Info!;
  const severityLabel = t(`announcement.severity.${SEVERITY[current.severity] ? current.severity : 'Info'}`);
  const cta = current.ctaLabel
    ? announcementCta(current.ctaUrl, isMultiStore && !storeDomain() ? null : getWebOrigin())
    : null;
  const dismiss = () => {
    // Bắt buộc xác nhận: nút Back của Android và chạm ngoài không đóng, chỉ nút "Đã hiểu".
    if (!current.requireAck) finish(current.id);
  };
  const handleBack = () => {
    if (zoomed) setZoomed(null);
    else if (detailOpen) setDetailOpen(false);
    else dismiss();
  };
  const openCta = async () => {
    if (!cta || !(await acknowledge(current))) return;
    if (cta.kind === 'app') router.push(cta.route as any);
    else openInAppBrowser(cta.url);
  };
  const image = current.imageUrl ? (
    <AnnouncementImage key={current.id} announcementId={current.id} url={current.imageUrl} title={current.title} onZoom={setZoomed} />
  ) : null;
  const actions = (
    <>
      {current.requireAck ? (
        <Text tone="muted" className="text-[12px] mt-3">
          {t('announcement.ackHint')}
        </Text>
      ) : null}

      <View className="gap-2 mt-4">
        {cta ? (
          <Button variant="outline" action="neutral" disabled={busy} onPress={openCta}>
            {current.ctaLabel}
          </Button>
        ) : null}
        <Button action={severity.action} disabled={busy} onPress={() => acknowledge(current)}>
          {t('announcement.understood')}
        </Button>
      </View>
    </>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleBack}>
      <BrandScope>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />
        {/* Vùng chạm ngoài nằm cạnh khung, không bọc khung: Pressable bọc ngoài làm vùng cuộn bên trong không cuộn được. */}
        <Pressable
          testID="announcement-backdrop"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={dismiss}
        />
        <View pointerEvents="box-none" className="flex-1 items-center justify-center px-6">
          <View style={{ width: '100%', maxWidth: 520 }}>
            <GlassView intensity={blur.sheet} className="rounded-[24px] border border-glass-border dark:border-glass-border-dark p-5">
              <View className="flex-row items-center gap-3 mb-3">
                <View
                  className="w-11 h-11 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${severity.color}29` }}
                >
                  <Icon name={severity.icon} size={24} color={severity.color} />
                </View>
                <View className="flex-1">
                  <Text variant="title2">{current.title}</Text>
                  <Text tone="muted" className="text-[12px] mt-0.5">
                    {severityLabel}
                    {queue.length > 1 ? ` · ${t('announcement.more', { count: queue.length - 1 })}` : ''}
                  </Text>
                </View>
              </View>

              <ScrollView
                testID="announcement-scroll"
                style={{ maxHeight: scrollMaxHeight(height, !!current.imageUrl) }}
                showsVerticalScrollIndicator
                onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
                onContentSizeChange={(_w, h) => setContentHeight(h)}
              >
                <Body markdown={current.bodyMarkdown} />
                {detailOpen ? null : image}
              </ScrollView>

              {needsDetail(!!current.imageUrl, contentHeight, viewportHeight) ? (
                <Pressable accessibilityRole="button" hitSlop={8} className="mt-3 self-start" onPress={() => setDetailOpen(true)}>
                  <Text className="font-bold text-[14px]" style={{ color: severity.color }}>
                    {t('announcement.viewDetail')}
                  </Text>
                </Pressable>
              ) : null}

              {actions}
            </GlassView>
          </View>
        </View>
        {detailOpen ? (
          <View
            testID="announcement-detail"
            className="bg-bg dark:bg-bg-dark"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
          >
            <View className="flex-row items-center gap-2 px-3 py-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('announcement.back')}
                hitSlop={8}
                className="w-10 h-10 items-center justify-center"
                onPress={() => setDetailOpen(false)}
              >
                <Icon name="arrow-left" size={24} />
              </Pressable>
              <Text variant="title2" className="flex-1">
                {current.title}
              </Text>
            </View>
            <ScrollView testID="announcement-detail-scroll" className="flex-1" contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator>
              <Body markdown={current.bodyMarkdown} />
              {image}
            </ScrollView>
            <View className="px-5">{actions}</View>
          </View>
        ) : null}
        {zoomed ? <ZoomedAnnouncementImage image={zoomed} title={current.title} onClose={() => setZoomed(null)} /> : null}
      </BrandScope>
    </Modal>
  );
}
