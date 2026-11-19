import { View } from 'react-native';

import { Badge, Card, Icon, Pressable, Text } from 'src/components/ui';

import { KIND_ICON, entryMeta, type WorkEntry } from './work-center';

// ----------------------------------------------------------------------
// Một mục của Trung tâm việc: mã (AG- / CV- / VS-) + loại, trạng thái, tên, ghi chú (bước agent / lỗi / số lần trả lại),
// thanh đạt của ca vệ sinh, người làm · hạn. Không bấm được (thiếu quyền mở màn chi tiết) thì không có mũi tên.
// ----------------------------------------------------------------------

const KIND_BG: Record<WorkEntry['kind'], string> = {
  agent: 'bg-secondary-soft',
  work: 'bg-warning-soft',
  cleaning: 'bg-success-soft',
};
const KIND_TONE = { agent: 'secondary', work: 'warning', cleaning: 'success' } as const;

export function WorkCenterCard({ entry, now, onPress }: { entry: WorkEntry; now: number; onPress: (() => void) | null }) {
  const meta = entryMeta(entry, now);
  const pct = entry.progress ? Math.round((entry.progress.passed / entry.progress.total) * 100) : 0;

  const body = (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center gap-2">
        <View className={`w-8 h-8 rounded-xl items-center justify-center ${KIND_BG[entry.kind]}`}>
          <Icon name={KIND_ICON[entry.kind]} size={18} tone={KIND_TONE[entry.kind]} />
        </View>
        <Text variant="caption" tone="faint" className="font-semibold flex-1" numberOfLines={1}>
          {entry.code}
        </Text>
        <Badge tone={entry.tone}>{entry.statusLabel}</Badge>
      </View>

      <Text variant="body" className="font-semibold" numberOfLines={2}>
        {entry.title}
      </Text>

      {entry.note ? (
        <Text variant="caption" tone={entry.column === 'ended' ? 'error' : 'muted'} numberOfLines={2}>
          {entry.note}
        </Text>
      ) : null}

      {entry.progress ? (
        <View className="flex-row items-center gap-2">
          <View className="flex-1 h-1.5 rounded-full bg-ink/10 dark:bg-white/10 overflow-hidden">
            <View className={entry.progress.failed > 0 ? 'h-full bg-error' : 'h-full bg-success'} style={{ width: `${pct}%` }} />
          </View>
          <Text variant="caption" tone="muted">
            {entry.progress.passed}/{entry.progress.total} đạt
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-center gap-2">
        <Text variant="caption" tone={entry.overdue ? 'error' : 'muted'} className="flex-1" numberOfLines={1}>
          {meta || (entry.kind === 'cleaning' ? 'Nhân viên trong ca' : '—')}
        </Text>
        {onPress ? <Icon name="chevron-right" size={18} tone="muted" /> : null}
      </View>
    </Card>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${entry.code} ${entry.title}, ${entry.statusLabel}`}>
      {body}
    </Pressable>
  );
}
