import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Text, Pressable, Icon } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';

// ----------------------------------------------------------------------
// Chỉ định / ngoại trừ nhân viên cho MỘT ca cụ thể trong tuần (per-slot).
// Chạm tên để xoay: thường → chỉ định (⭐, luôn xếp) → ngoại trừ (✕, không xếp).
// ----------------------------------------------------------------------

export type SlotStaffState = 'none' | 'designate' | 'exclude';

export function SlotDesignationSheet({
  visible,
  onClose,
  title,
  subtitle,
  staff,
  designated,
  excluded,
  registeredSet,
  onCycle,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  staff: { id: string; name: string }[];
  designated: Set<string>;
  excluded: Set<string>;
  /** staffId đã đăng ký ca này (hiện nhãn "đã đăng ký"). */
  registeredSet: Set<string>;
  onCycle: (staffId: string) => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View className="gap-3">
        {subtitle ? <Text variant="bodySmall" tone="muted">{subtitle}</Text> : null}
        <Text variant="caption" tone="muted">
          Chạm để xoay: thường → <Text className="text-primary font-bold">chỉ định</Text> → <Text tone="error" className="font-bold">ngoại trừ</Text>.
        </Text>

        {staff.length === 0 ? (
          <Text tone="muted" className="text-center py-4">Chưa chọn nhân viên nào — hãy chọn ở danh sách trên.</Text>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {staff.map((u) => {
              const state: SlotStaffState = designated.has(u.id) ? 'designate' : excluded.has(u.id) ? 'exclude' : 'none';
              const box =
                state === 'designate' ? 'bg-primary border-primary' :
                state === 'exclude' ? 'bg-error-soft border-error/40' :
                'bg-surface dark:bg-surface-dark border-line/60 dark:border-line-dark';
              const textCls = state === 'designate' ? 'text-white' : state === 'exclude' ? 'text-error' : 'text-ink dark:text-ink-dark';
              const icon = state === 'designate' ? 'star' : state === 'exclude' ? 'cancel' : null;
              return (
                <Pressable
                  key={u.id}
                  onPress={() => { haptics.selection(); onCycle(u.id); }}
                  className={cn('flex-row items-center gap-1 px-3 py-2 rounded-full border', box)}
                >
                  {icon ? <Icon name={icon} size={13} color={state === 'designate' ? '#fff' : undefined} tone={state === 'exclude' ? 'error' : 'default'} /> : null}
                  <Text variant="caption" className={cn('font-semibold', textCls)}>{u.name}</Text>
                  {state === 'none' && registeredSet.has(u.id) ? (
                    <Icon name="check-decagram" size={12} tone="success" />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </Sheet>
  );
}
