import { useState } from 'react';
import { View } from 'react-native';

import { Text, Pressable, Icon, Spinner } from 'src/components/ui';
import { useT } from 'src/i18n';
import type { AssistantStep } from 'src/api/assistant';

// ----------------------------------------------------------------------
// Các bước tra cứu của trợ lý (sự kiện `step`): đang trả lời → danh sách sống (tối đa 5 dòng cuối,
// quay khi đang chạy, tích khi xong, cảnh báo khi lỗi; xong hết mà chưa có chữ → "Đang tổng hợp…").
// Trả lời xong → gọn một dòng "Đã tra cứu N nguồn dữ liệu", chạm để mở.
// ----------------------------------------------------------------------

const LIVE_ROWS = 5;

function StepRow({ step }: { step: AssistantStep }) {
  const t = useT();
  return (
    <View className="flex-row items-center gap-2 min-h-[20px]">
      <View className="w-4 items-center">
        {step.state === 'running' ? (
          <Spinner />
        ) : step.state === 'error' ? (
          <Icon name="alert-circle-outline" size={15} tone="error" />
        ) : (
          <Icon name="check-circle" size={15} tone="success" />
        )}
      </View>
      <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
        {step.label || step.name || t('assistant.thinking')}
      </Text>
    </View>
  );
}

export function StepList({ steps, streaming, hasText }: { steps?: AssistantStep[] | null; streaming: boolean; hasText: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;

  if (streaming) {
    const allSettled = steps.every((s) => s.state !== 'running');
    return (
      <View className="gap-1.5 mb-1.5">
        {steps.slice(-LIVE_ROWS).map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
        {allSettled && !hasText ? (
          <View className="flex-row items-center gap-2 min-h-[20px]">
            <View className="w-4 items-center">
              <Spinner />
            </View>
            <Text variant="caption" tone="muted">{t('assistant.composing')}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View className="mb-1.5">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-1.5 py-0.5 self-start"
      >
        <Icon name="database-search-outline" size={14} tone="muted" />
        <Text variant="caption" tone="muted">{t('assistant.stepsDone', { n: steps.length })}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} tone="muted" />
      </Pressable>
      {open ? (
        <View className="gap-1.5 mt-1 pl-0.5">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
