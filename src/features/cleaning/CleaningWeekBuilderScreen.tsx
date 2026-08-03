import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import { Screen, AppHeader, SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Chip, Icon, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import {
  createCleaningTaskTemplate,
  deleteCleaningTaskTemplate,
  duplicateCleaningWeek,
  getCleaningTaskDefinitions,
  getCleaningTemplateWeek,
} from 'src/api/cleaning';
import { getAllShiftTemplates } from 'src/api/schedule';
import type { CleaningShiftBlock, ICleaningTaskDefinition } from 'src/types/corecms-api';

dayjs.extend(isoWeek);

// ----------------------------------------------------------------------

const BLOCKS: CleaningShiftBlock[] = ['Morning', 'Afternoon', 'Evening'];
const BLOCK_LABEL: Record<CleaningShiftBlock, string> = { Morning: 'Sáng', Afternoon: 'Chiều', Evening: 'Tối' };
// dayjs.day(): 0 = Sunday .. 6 = Saturday - trùng thứ tự .NET DayOfWeek, KHÔNG dùng format('dddd')
// vì locale app có thể là 'vi' (sẽ trả "Thứ Hai" thay vì "Monday" mà backend cần).
const DOTNET_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function CleaningWeekBuilderScreen() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Dayjs>(() => dayjs().startOf('isoWeek'));
  const [addTarget, setAddTarget] = useState<{ date: string; block: CleaningShiftBlock } | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  // Bước 2 của luồng thêm đầu việc: chọn (các) ca làm việc áp dụng — bắt buộc BE.
  const [pendingDefinition, setPendingDefinition] = useState<ICleaningTaskDefinition | null>(null);
  const [selectedShiftTemplateIds, setSelectedShiftTemplateIds] = useState<Set<string>>(new Set());
  const [submittingTemplate, setSubmittingTemplate] = useState(false);

  const fromDate = weekStart.format('YYYY-MM-DD');
  const today = dayjs().format('YYYY-MM-DD');
  const nextWeekEntirelyPast = weekStart.add(13, 'day').format('YYYY-MM-DD') < today;

  const { data: defsData } = useQuery({
    queryKey: ['cleaning', 'task-definitions'],
    queryFn: getCleaningTaskDefinitions,
  });
  const definitions = (defsData ?? []).filter((d: ICleaningTaskDefinition) => d.isActive);

  const { data: shiftTemplatesData } = useQuery({
    queryKey: ['shift-templates'],
    queryFn: getAllShiftTemplates,
  });
  const shiftTemplates = (shiftTemplatesData ?? []).filter((s) => s.isActive);

  const { data: weekData, isFetching, refetch } = useQuery({
    queryKey: ['cleaning', 'template-week', fromDate],
    queryFn: () => getCleaningTemplateWeek(fromDate),
  });
  const cells = weekData ?? [];

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);

  function cellFor(day: Dayjs, block: CleaningShiftBlock) {
    const dateStr = day.format('YYYY-MM-DD');
    return cells.find((c) => c.date === dateStr && c.cleaningBlock === block);
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['cleaning', 'template-week'] });
  }

  // Bước 1: chọn đầu việc từ thư viện → mở bước 2 chọn ca áp dụng (bắt buộc).
  function pickDefinition(definition: ICleaningTaskDefinition) {
    setPendingDefinition(definition);
    setSelectedShiftTemplateIds(new Set());
  }

  function toggleShiftTemplate(id: string) {
    setSelectedShiftTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function closeAddFlow() {
    setAddTarget(null);
    setPendingDefinition(null);
    setSelectedShiftTemplateIds(new Set());
  }

  // Bước 2: xác nhận (các) ca áp dụng rồi mới tạo template — shiftTemplateIds
  // là bắt buộc, ít nhất 1, theo hợp đồng API mới.
  async function handleConfirmShiftTemplates() {
    if (!addTarget || !pendingDefinition) return;
    if (selectedShiftTemplateIds.size === 0) {
      toast.info('Chọn ít nhất 1 ca làm việc áp dụng đầu việc này.', 'Chưa đủ dữ liệu');
      return;
    }
    setSubmittingTemplate(true);
    try {
      await createCleaningTaskTemplate({
        dayOfWeek: DOTNET_DAY_NAMES[dayjs(addTarget.date).day()],
        cleaningBlock: addTarget.block,
        name: pendingDefinition.name,
        area: pendingDefinition.area || undefined,
        sortOrder: 0,
        fromDate,
        shiftTemplateIds: [...selectedShiftTemplateIds],
      });
      closeAddFlow();
      invalidate();
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setSubmittingTemplate(false);
    }
  }

  async function handleRemove(templateId: string) {
    try {
      await deleteCleaningTaskTemplate(templateId);
      invalidate();
    } catch (err: any) {
      toast.error(extractApiError(err));
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const { createdCount } = await duplicateCleaningWeek(fromDate);
      toast.success(
        createdCount > 0
          ? `Đã nhân bản ${createdCount} đầu việc sang tuần sau`
          : 'Tuần sau đã có đủ checklist (không cần nhân bản)'
      );
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <Screen scroll refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Xây dựng checklist tuần" back />

      <View className="flex-row items-center justify-between gap-2 py-1">
        <Pressable
          onPress={() => setWeekStart((w) => w.subtract(7, 'day'))}
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-left" size={20} tone="default" />
        </Pressable>
        <Text variant="subtitle">
          {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
        </Text>
        <Pressable
          onPress={() => setWeekStart((w) => w.add(7, 'day'))}
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-right" size={20} tone="default" />
        </Pressable>
      </View>

      <Button
        variant="outline"
        icon="content-copy"
        loading={duplicating}
        disabled={nextWeekEntirelyPast}
        onPress={handleDuplicate}
      >
        Nhân bản sang tuần sau
      </Button>

      {days.map((day) => {
        const dateStr = day.format('YYYY-MM-DD');
        const past = dateStr < today;
        return (
          <SectionCard
            key={dateStr}
            title={`${day.format('dddd, DD/MM')}${past ? ' (đã qua)' : ''}`}
            icon="calendar-today"
          >
            <View>
              {BLOCKS.map((block, i) => {
                const cell = cellFor(day, block);
                return (
                  <View key={block}>
                    {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                    <View className="py-2 gap-1.5" style={{ opacity: past ? 0.5 : 1 }}>
                      <View className="flex-row items-center justify-between">
                        <Text className="font-semibold text-[13px]">{BLOCK_LABEL[block]}</Text>
                        {!past && (
                          <Pressable
                            testID={`cleaning-add-${dateStr}-${block}`}
                            onPress={() => setAddTarget({ date: dateStr, block })}
                            className="w-7 h-7 items-center justify-center rounded-full bg-primary/10"
                          >
                            <Icon name="plus" size={16} tone="primary" />
                          </Pressable>
                        )}
                      </View>
                      <View className="flex-row flex-wrap gap-1.5">
                        {(cell?.templates ?? []).map((template) => (
                          <Chip
                            key={template.id}
                            label={template.name}
                            icon={past ? undefined : 'close-circle'}
                            color={past ? 'default' : 'error'}
                            variant="soft"
                            size="sm"
                            onPress={past ? undefined : () => handleRemove(template.id)}
                          />
                        ))}
                        {(cell?.templates ?? []).length === 0 ? (
                          <Text variant="caption" tone="faint">Chưa có đầu việc</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </SectionCard>
        );
      })}

      <Sheet
        visible={!!addTarget && !pendingDefinition}
        title="Chọn đầu việc từ thư viện"
        onClose={closeAddFlow}
      >
        <View className="gap-2">
          {definitions.length === 0 ? (
            <Text variant="bodySmall" tone="muted">
              Thư viện trống — vào "Thư viện đầu việc" để thêm trước.
            </Text>
          ) : (
            definitions.map((def) => (
              <Pressable
                key={def.id}
                testID={`cleaning-def-${def.id}`}
                onPress={() => pickDefinition(def)}
                className="p-3 rounded-xl bg-bg dark:bg-surface-dark"
              >
                <Text className="font-semibold">{def.name}</Text>
                {def.area ? <Text variant="caption" tone="muted">{def.area}</Text> : null}
              </Pressable>
            ))
          )}
        </View>
      </Sheet>

      {/* Bước 2: chọn (các) ca làm việc áp dụng đầu việc vừa chọn — bắt buộc chọn ≥1. */}
      <Sheet
        visible={!!pendingDefinition}
        title={`Áp dụng cho ca — ${pendingDefinition?.name ?? ''}`}
        onClose={closeAddFlow}
        footer={
          <Button
            loading={submittingTemplate}
            disabled={selectedShiftTemplateIds.size === 0}
            onPress={handleConfirmShiftTemplates}
          >
            {`Xác nhận (${selectedShiftTemplateIds.size} ca)`}
          </Button>
        }
      >
        <View className="gap-1">
          {shiftTemplates.length === 0 ? (
            <Text variant="bodySmall" tone="muted">
              Chưa có ca làm việc nào — vào phần quản lý ca để tạo trước.
            </Text>
          ) : (
            shiftTemplates.map((st, i) => {
              const on = selectedShiftTemplateIds.has(st.id);
              return (
                <View key={st.id}>
                  {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                  <Pressable
                    testID={`shift-template-${st.id}`}
                    onPress={() => toggleShiftTemplate(st.id)}
                    className="flex-row items-center gap-3 py-2.5"
                  >
                    <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} tone={on ? 'primary' : 'faint'} />
                    <View className="flex-1">
                      <Text className="font-semibold text-[14px]">{st.name}</Text>
                      <Text variant="caption" tone="muted">{st.startTime} – {st.endTime}</Text>
                    </View>
                  </Pressable>
                </View>
              );
            })
          )}
          <Text variant="caption" tone="faint" className="mt-1">
            Nhân viên đang làm (các) ca này sẽ thấy đầu việc trong checklist của họ.
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}
