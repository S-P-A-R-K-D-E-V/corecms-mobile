import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Chip, Icon, Pressable, Skeleton, Text } from 'src/components/ui';
import { getActiveStaffUsers, isActiveUser } from 'src/api/users';

import { GROUP_SUGGESTIONS } from './schedule';

// ----------------------------------------------------------------------
// Mảnh giao diện dùng chung của màn Công việc: chọn ngày bằng mũi tên (app không có date-picker), chọn nhân viên bằng chip
// (không mở sheet lồng sheet), chọn nhóm gợi ý.
// ----------------------------------------------------------------------

export const WORK_STAFF_KEY = ['work-center', 'staff'] as const;

/** Nhân viên đang làm (GET /users/active-staff) — dùng chung cho chọn người làm / đổi người. */
export function useWorkStaff(enabled = true) {
  return useQuery({
    queryKey: WORK_STAFF_KEY,
    queryFn: async () =>
      (await getActiveStaffUsers())
        .filter(isActiveUser)
        .map((u) => ({ id: u.id, name: u.fullName || `${u.lastName ?? ''} ${u.firstName ?? ''}`.trim() || u.email }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** "Thứ Hai, 24/11/2026" với mũi tên lùi / tới; không lùi quá `min`. */
export function DateStepper({
  label,
  value,
  onChange,
  min,
}: {
  label?: string;
  value: string;
  onChange: (date: string) => void;
  min?: string;
}) {
  const canBack = !min || dayjs(value).isAfter(dayjs(min), 'day');
  return (
    <View className="gap-1">
      {label ? (
        <Text variant="caption" tone="muted" className="font-semibold">
          {label}
        </Text>
      ) : null}
      <View className="flex-row items-center justify-between gap-2">
        <Pressable
          onPress={() => canBack && onChange(dayjs(value).subtract(1, 'day').format('YYYY-MM-DD'))}
          disabled={!canBack}
          accessibilityLabel="Ngày trước"
          className={`w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark ${canBack ? '' : 'opacity-40'}`}
        >
          <Icon name="chevron-left" size={20} tone="default" />
        </Pressable>
        <Text variant="body" className="font-semibold capitalize">
          {dayjs(value).format('dddd, DD/MM/YYYY')}
        </Text>
        <Pressable
          onPress={() => onChange(dayjs(value).add(1, 'day').format('YYYY-MM-DD'))}
          accessibilityLabel="Ngày sau"
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-right" size={20} tone="default" />
        </Pressable>
      </View>
    </View>
  );
}

/** Chip chọn một nhân viên; `noneLabel` có thì thêm chip "không chọn" (vd "Người trong ca"). */
export function StaffChips({
  label,
  value,
  onChange,
  noneLabel,
  excludeId,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  noneLabel?: string;
  excludeId?: string | null;
}) {
  const { data, isLoading, isError } = useWorkStaff();
  const staff = (data ?? []).filter((s) => s.id !== excludeId);
  return (
    <View className="gap-1.5">
      <Text variant="caption" tone="muted" className="font-semibold">
        {label}
      </Text>
      {isLoading ? (
        <Skeleton width="100%" height={32} radius={16} />
      ) : isError ? (
        <Text variant="caption" tone="error">
          Không tải được danh sách nhân viên.
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {noneLabel ? (
            <Chip label={noneLabel} size="sm" color="primary" selected={value === null} onPress={() => onChange(null)} />
          ) : null}
          {staff.map((s) => (
            <Chip key={s.id} label={s.name} size="sm" color="primary" selected={value === s.id} onPress={() => onChange(s.id)} />
          ))}
          {staff.length === 0 ? (
            <Text variant="caption" tone="muted">
              Chưa có nhân viên nào.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

/** Chip nhóm gợi ý; bấm lại nhóm đang chọn thì bỏ chọn. Nhóm khác gõ ở ô riêng của màn gọi. */
export function GroupChips({ value, onChange }: { value: string; onChange: (group: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {GROUP_SUGGESTIONS.map((g) => (
        <Chip key={g} label={g} size="sm" color="secondary" selected={value === g} onPress={() => onChange(value === g ? '' : g)} />
      ))}
    </ScrollView>
  );
}
