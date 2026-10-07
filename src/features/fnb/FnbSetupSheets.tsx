import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { createFnbArea, createFnbTable, setFnbSoldOut } from 'src/api/fnb';
import { Sheet, ToggleRow } from 'src/components/shared';
import { Button, Chip, Text, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';
import type { IFnbMenu } from 'src/types/fnb';

import { fnbKeys } from './use-fnb';

// ----------------------------------------------------------------------
// Thiết lập F&B rút gọn trên app (cần mạng, gọi thẳng API — không qua hàng đợi đơn):
//   - Thêm bàn (Quản lý): chọn khu vực có sẵn hoặc gõ tên khu vực mới;
//   - Hết món (mọi nhân viên): bật / tắt hết món cho món và món thêm ở chi nhánh đang làm việc.
// Thiết lập đầy đủ (sửa / xoá khu vực, bàn, món thêm của món, ghi chú nhanh) ở trang web "Thiết lập F&B".
// ----------------------------------------------------------------------

type AreaOption = { id: string; name: string };

export function AddTableSheet({
  visible,
  onClose,
  branchId,
  areas,
}: {
  visible: boolean;
  onClose: () => void;
  branchId: string;
  areas: AreaOption[];
}) {
  const qc = useQueryClient();
  const [areaId, setAreaId] = useState<string | null>(null);
  const [newArea, setNewArea] = useState('');
  const [name, setName] = useState('');
  const [seats, setSeats] = useState('');
  const [saving, setSaving] = useState(false);

  // Chưa có khu vực nào → bắt buộc gõ tên khu vực mới.
  const pickedArea = areaId ?? (areas.length > 0 ? areas[0]!.id : null);
  const usingNewArea = areas.length === 0 || areaId === 'new';
  const canSave = !!name.trim() && (usingNewArea ? !!newArea.trim() : !!pickedArea);

  function reset() {
    setAreaId(null);
    setNewArea('');
    setName('');
    setSeats('');
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const targetArea = usingNewArea ? (await createFnbArea(branchId, newArea.trim())).id : pickedArea!;
      const seatCount = Number.parseInt(seats, 10);
      await createFnbTable({
        branchId,
        areaId: targetArea,
        name: name.trim(),
        seats: Number.isFinite(seatCount) && seatCount > 0 ? seatCount : null,
      });
      toast.success(t('fnbSetup.tableAdded', { name: name.trim() }));
      await qc.invalidateQueries({ queryKey: fnbKeys.floor(branchId) });
      // Giữ khu vực vừa dùng để thêm bàn kế tiếp nhanh; chỉ xoá tên bàn.
      if (usingNewArea) reset();
      else setName('');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={t('fnbSetup.addTable')}
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <Button loading={saving} disabled={!canSave} onPress={save}>
          {t('fnbSetup.addTable')}
        </Button>
      }
    >
      <View className="gap-3">
        <Text variant="label" tone="muted">{t('fnbSetup.area')}</Text>
        {areas.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {areas.map((a) => (
              <Chip key={a.id} label={a.name} selected={!usingNewArea && pickedArea === a.id} color="primary" onPress={() => setAreaId(a.id)} />
            ))}
            <Chip icon="plus" label={t('fnbSetup.newArea')} selected={usingNewArea} color="primary" onPress={() => setAreaId('new')} />
          </ScrollView>
        ) : null}
        {usingNewArea ? (
          <TextField
            label={t('fnbSetup.newAreaName')}
            placeholder={t('fnbSetup.newAreaPlaceholder')}
            value={newArea}
            onChangeText={setNewArea}
            maxLength={100}
          />
        ) : null}
        <TextField label={t('fnbSetup.tableName')} placeholder={t('fnbSetup.tablePlaceholder')} value={name} onChangeText={setName} maxLength={50} />
        <TextField label={t('fnbSetup.seats')} value={seats} onChangeText={setSeats} keyboardType="number-pad" maxLength={2} />
        <Text variant="caption" tone="muted">{t('fnbSetup.webHint')}</Text>
      </View>
    </Sheet>
  );
}

export function SoldOutSheet({
  visible,
  onClose,
  branchId,
  menu,
}: {
  visible: boolean;
  onClose: () => void;
  branchId: string;
  menu: IFnbMenu | undefined;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const dishes = useMemo(
    () => [...(menu?.dishes ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi')),
    [menu]
  );
  const toppings = useMemo(
    () => [...(menu?.toppings ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi')),
    [menu]
  );

  async function toggle(productId: string, isSoldOut: boolean) {
    setBusy(productId);
    try {
      await setFnbSoldOut(branchId, productId, isSoldOut);
      await qc.invalidateQueries({ queryKey: fnbKeys.menu(branchId) });
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet visible={visible} title={t('fnbSetup.soldOutTitle')} onClose={onClose}>
      <Text variant="bodySmall" tone="muted" className="mb-1">{t('fnbSetup.soldOutHint')}</Text>
      {dishes.length === 0 ? (
        <Text variant="bodySmall" tone="muted" className="py-6 text-center">{t('fnb.noDishes')}</Text>
      ) : null}
      {dishes.map((d) => (
        <ToggleRow
          key={d.id}
          title={d.name}
          value={d.isSoldOut}
          disabled={busy === d.id}
          onToggle={(v) => void toggle(d.id, v)}
        />
      ))}
      {toppings.length > 0 ? (
        <Text variant="label" tone="muted" className="mt-3">{t('fnbSetup.toppings')}</Text>
      ) : null}
      {toppings.map((tp) => (
        <ToggleRow
          key={tp.productId}
          title={tp.name}
          value={tp.isSoldOut}
          disabled={busy === tp.productId}
          onToggle={(v) => void toggle(tp.productId, v)}
        />
      ))}
    </Sheet>
  );
}
