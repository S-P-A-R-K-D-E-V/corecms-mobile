import { useState } from 'react';
import { Image, View } from 'react-native';

import { Text, Badge, Icon, Pressable, cn } from 'src/components/ui';
import { getStorageUrl } from 'src/api/axios';
import { ImageViewer } from 'src/features/chat/ImageViewer';
import { INSPECTION_OUTCOME_LABEL, type IInspectionPhoto, type InspectionLevel, type InspectionOutcome } from 'src/types/inspection';
import type { DraftPhoto } from './inspection-draft';

// ----------------------------------------------------------------------
// Mảnh giao diện dùng chung của màn kiểm tra cửa hàng.
// ----------------------------------------------------------------------

/** Mục B (bắt buộc, sửa trong 15 phút) / T (tiêu chuẩn, sửa trong ca). */
export function LevelBadge({ level }: { level: InspectionLevel }) {
  return level === 'Mandatory' ? <Badge tone="error">B</Badge> : <Badge tone="info">T</Badge>;
}

/** Nhắc quy định ảnh — hiện ở mọi chỗ chụp ảnh kiểm tra. */
export function PhotoRules() {
  return (
    <View className="flex-row gap-2 rounded-xl bg-warning/10 px-3 py-2">
      <Icon name="camera-off-outline" size={16} tone="warning" />
      <Text variant="caption" tone="muted" className="flex-1">
        Ảnh chỉ dùng nội bộ. Không chụp mặt khách, không chụp khu thay đồ và WC khi có người bên trong.
      </Text>
    </View>
  );
}

const OUTCOME_STYLE: Record<InspectionOutcome, { on: string; off: string; text: string }> = {
  Pass: { on: 'bg-success border-success', off: 'border-success/40 bg-success/5', text: 'text-success' },
  Fail: { on: 'bg-error border-error', off: 'border-error/40 bg-error/5', text: 'text-error' },
  NotApplicable: { on: 'bg-ink border-ink dark:bg-surface-dark', off: 'border-line dark:border-line-dark', text: 'text-muted' },
};

/** 3 nút to Đạt / Không đạt / NA — bấm được bằng một tay khi đang đi kiểm. */
export function OutcomeButtons({
  value,
  disabled,
  onChange,
}: {
  value: InspectionOutcome | null;
  disabled?: boolean;
  onChange: (outcome: InspectionOutcome) => void;
}) {
  return (
    <View className="flex-row gap-2">
      {(['Pass', 'Fail', 'NotApplicable'] as const).map((o) => {
        const s = OUTCOME_STYLE[o];
        const selected = value === o;
        return (
          <Pressable
            key={o}
            disabled={disabled}
            onPress={() => onChange(o)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            className={cn('flex-1 h-12 rounded-xl border items-center justify-center', selected ? s.on : s.off, disabled && !selected && 'opacity-50')}
          >
            <Text className={cn('font-bold text-[15px]', selected ? 'text-white' : s.text)}>{INSPECTION_OUTCOME_LABEL[o]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ảnh đã lên server + ảnh trên máy chưa gửi; chạm để xem to, ảnh trên máy có nút bỏ. */
export function PhotoStrip({
  server,
  local,
  onRemoveLocal,
}: {
  server: readonly IInspectionPhoto[];
  local?: readonly DraftPhoto[];
  onRemoveLocal?: (index: number) => void;
}) {
  const [viewer, setViewer] = useState<number | null>(null);
  const images = [...server.map((p) => ({ uri: getStorageUrl(p.url) })), ...(local ?? []).map((p) => ({ uri: p.uri }))];
  if (images.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-2">
      {images.map((img, i) => {
        const localIndex = i - server.length;
        return (
          <View key={`${img.uri}-${i}`} className="relative">
            <Pressable onPress={() => setViewer(i)} accessibilityLabel={`Ảnh ${i + 1}`}>
              <Image source={{ uri: img.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />
            </Pressable>
            {localIndex >= 0 && onRemoveLocal ? (
              <Pressable
                onPress={() => onRemoveLocal(localIndex)}
                accessibilityLabel="Bỏ ảnh"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error items-center justify-center"
              >
                <Icon name="close" size={12} tone="inverse" />
              </Pressable>
            ) : null}
            {localIndex >= 0 && !(local ?? [])[localIndex]?.key ? (
              <View className="absolute bottom-1 left-1 rounded bg-black/60 px-1">
                <Text className="text-[10px] text-white">Chưa gửi</Text>
              </View>
            ) : null}
          </View>
        );
      })}
      {viewer !== null ? (
        <ImageViewer images={images} initialIndex={Math.min(viewer, images.length - 1)} visible onClose={() => setViewer(null)} />
      ) : null}
    </View>
  );
}
