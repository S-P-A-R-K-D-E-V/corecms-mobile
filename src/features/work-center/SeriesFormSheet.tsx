import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Sheet, ToggleRow } from 'src/components/shared';
import { Button, Chip, Pressable, Text, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { createCleaningSeries, updateCleaningSeries } from 'src/api/cleaning';
import type { ICleaningSeries } from 'src/types/corecms-api';

import {
  BLOCKS,
  BLOCK_LABEL,
  WEEK_DAYS,
  buildCreateSeriesBody,
  buildUpdateSeriesBody,
  cellKey,
  emptySeriesForm,
  seriesToForm,
  setAssignee,
  toggleBlockAllDays,
  toggleCell,
  type SeriesForm,
} from './schedule';
import { DateStepper, GroupChips, StaffChips } from './work-center-ui';

// ----------------------------------------------------------------------
// Thêm / sửa một việc định kỳ (Lịch tuần): tên, khu, nhóm, cần ảnh, tự ghi vi phạm (ẩn khi có người cố định), người làm cố
// định, lưới thứ × ca (người cố định: chỉ thứ), ngày bắt đầu / áp dụng từ (≥ hôm nay), ngày kết thúc tuỳ chọn.
// Sửa = core-be dừng bản cũ trước ngày áp dụng rồi tạo bản mới cùng chuỗi; việc đã sinh trước ngày đó giữ nguyên.
// ----------------------------------------------------------------------

export function SeriesFormSheet({
  visible,
  editing,
  initialDow,
  onClose,
}: {
  visible: boolean;
  /** null = thêm mới. */
  editing: ICleaningSeries | null;
  /** Thứ đang xem — thêm mới thì chọn sẵn thứ đó ca sáng. */
  initialDow: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const today = dayjs().format('YYYY-MM-DD');
  const [form, setForm] = useState<SeriesForm>(() => emptySeriesForm(today));
  const [busy, setBusy] = useState(false);
  const fixed = !!form.assigneeUserId;

  useEffect(() => {
    if (!visible) return;
    setForm(editing ? seriesToForm(editing, today) : { ...emptySeriesForm(today), cells: [cellKey(initialDow, 'Morning')] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing]);

  const patch = (p: Partial<SeriesForm>) => setForm((f) => ({ ...f, ...p }));

  async function save() {
    const built = editing ? buildUpdateSeriesBody(form, today) : buildCreateSeriesBody(form, today);
    if (!built.ok) {
      toast.warning(built.error);
      return;
    }
    setBusy(true);
    try {
      if (editing) await updateCleaningSeries(editing.seriesId, built.body as any);
      else await createCleaningSeries(built.body as any);
      toast.success(editing ? 'Đã lưu việc định kỳ' : 'Đã thêm việc định kỳ');
      qc.invalidateQueries({ queryKey: ['work-center'] });
      onClose();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa lưu được');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={editing ? `Sửa: ${editing.name}` : 'Thêm việc định kỳ'}
      onClose={busy ? () => {} : onClose}
      footer={
        <Button loading={busy} onPress={save}>
          {editing ? 'Lưu thay đổi' : 'Thêm vào lịch tuần'}
        </Button>
      }
    >
      <View className="gap-3">
        <TextField label="Tên việc" value={form.name} onChangeText={(name) => patch({ name })} placeholder="VD: Quét và lau sàn" />
        <TextField label="Khu (tuỳ chọn)" value={form.area} onChangeText={(area) => patch({ area })} placeholder="VD: Tầng 1" />
        <View className="gap-1.5">
          <Text variant="caption" tone="muted" className="font-semibold">
            Nhóm
          </Text>
          <GroupChips value={form.group} onChange={(group) => patch({ group })} />
          <TextField value={form.group} onChangeText={(group) => patch({ group })} placeholder="Hoặc gõ nhóm khác" />
        </View>

        <ToggleRow
          icon="camera-outline"
          title="Cần ảnh khi xong"
          description={form.requiresPhoto ? 'Nhân viên chụp ảnh, quản lý chấm' : 'Chỉ tick "Đã làm", không cần ảnh'}
          value={form.requiresPhoto}
          onToggle={(requiresPhoto) => patch({ requiresPhoto })}
        />
        {!fixed ? (
          <ToggleRow
            icon="alert-octagon-outline"
            title="Hết ngày chưa làm thì tự ghi vi phạm"
            description="Ghi cho trưởng ca (không có trưởng ca: mọi người có mặt trong ca)"
            value={form.autoViolation}
            onToggle={(autoViolation) => patch({ autoViolation })}
          />
        ) : null}

        <StaffChips
          label="Người làm"
          value={form.assigneeUserId}
          noneLabel="Người trong ca"
          onChange={(id) => setForm((f) => setAssignee(f, id))}
        />
        {fixed ? (
          <Text variant="caption" tone="muted">
            Người cố định: mỗi ngày đã chọn sinh một việc giao riêng cho người đó, hạn cuối ngày. Hôm người đó không có ca thì
            không tính trễ — đổi người ở tab Giao việc.
          </Text>
        ) : null}

        <View className="gap-1.5">
          <Text variant="caption" tone="muted" className="font-semibold">
            {fixed ? 'Thứ trong tuần' : 'Thứ × ca'}
          </Text>
          {fixed ? (
            <View className="flex-row flex-wrap gap-2">
              {WEEK_DAYS.map((d) => (
                <Chip
                  key={d.dow}
                  label={d.short}
                  size="sm"
                  color="primary"
                  selected={form.cells.includes(cellKey(d.dow, '*'))}
                  onPress={() => patch({ cells: toggleCell(form.cells, cellKey(d.dow, '*')) })}
                />
              ))}
              <Chip label="Mọi ngày" size="sm" variant="outlined" onPress={() => patch({ cells: toggleBlockAllDays(form.cells, '*') })} />
            </View>
          ) : (
            <View className="gap-1">
              <View className="flex-row items-center gap-2">
                <View className="w-10" />
                {BLOCKS.map((b) => (
                  <Pressable
                    key={b}
                    onPress={() => patch({ cells: toggleBlockAllDays(form.cells, b) })}
                    accessibilityLabel={`Ca ${BLOCK_LABEL[b]} mọi ngày`}
                    className="flex-1 items-center py-1"
                  >
                    <Text variant="caption" tone="primary" className="font-semibold">
                      {BLOCK_LABEL[b]} ▾
                    </Text>
                  </Pressable>
                ))}
              </View>
              {WEEK_DAYS.map((d) => (
                <View key={d.dow} className="flex-row items-center gap-2">
                  <Text variant="caption" className="w-10 font-semibold">
                    {d.short}
                  </Text>
                  {BLOCKS.map((b) => {
                    const on = form.cells.includes(cellKey(d.dow, b));
                    return (
                      <Pressable
                        key={b}
                        onPress={() => patch({ cells: toggleCell(form.cells, cellKey(d.dow, b)) })}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${d.label} ca ${BLOCK_LABEL[b]}`}
                        className={`flex-1 h-8 rounded-lg items-center justify-center ${on ? 'bg-primary' : 'bg-ink/5 dark:bg-white/10'}`}
                      >
                        <Text variant="caption" className={on ? 'text-white font-semibold' : ''} tone={on ? undefined : 'muted'}>
                          {on ? '✓' : '–'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <Text variant="caption" tone="faint">
                Bấm tên ca để bật / tắt ca đó cho cả tuần.
              </Text>
            </View>
          )}
        </View>

        <DateStepper
          label={editing ? 'Áp dụng thay đổi từ' : 'Bắt đầu từ'}
          value={form.fromDate}
          min={today}
          onChange={(fromDate) =>
            patch({ fromDate, toDate: form.toDate && dayjs(form.toDate).isBefore(fromDate) ? fromDate : form.toDate })
          }
        />
        {form.toDate ? (
          <View className="gap-1">
            <DateStepper label="Đến hết ngày" value={form.toDate} min={form.fromDate} onChange={(toDate) => patch({ toDate })} />
            <Button size="sm" variant="ghost" onPress={() => patch({ toDate: null })}>
              Bỏ ngày kết thúc
            </Button>
          </View>
        ) : (
          <Button size="sm" variant="outline" icon="calendar-end" onPress={() => patch({ toDate: form.fromDate })}>
            Đặt ngày kết thúc (đang: không giới hạn)
          </Button>
        )}
        {editing ? (
          <Text variant="caption" tone="faint">
            Việc đã sinh trước ngày áp dụng giữ nguyên.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
