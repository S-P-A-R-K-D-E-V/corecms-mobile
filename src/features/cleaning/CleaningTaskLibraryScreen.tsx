import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Screen, AppHeader, Sheet } from 'src/components/shared';
import { Text, Button, TextField, Icon, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import {
  createCleaningTaskDefinition,
  deleteCleaningTaskDefinition,
  getCleaningTaskDefinitions,
  updateCleaningTaskDefinition,
} from 'src/api/cleaning';
import type { ICleaningTaskDefinition } from 'src/types/corecms-api';

export function CleaningTaskLibraryScreen() {
  const qc = useQueryClient();
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['cleaning', 'task-definitions'],
    queryFn: getCleaningTaskDefinitions,
  });
  const definitions = data ?? [];

  const [editing, setEditing] = useState<ICleaningTaskDefinition | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setEditing(null);
    setName('');
    setArea('');
    setSheetOpen(true);
  }

  function openEdit(def: ICleaningTaskDefinition) {
    setEditing(def);
    setName(def.name);
    setArea(def.area ?? '');
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.warning('Tên đầu việc là bắt buộc');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateCleaningTaskDefinition(editing.id, { name: name.trim(), area: area.trim() || undefined, isActive: editing.isActive });
      } else {
        await createCleaningTaskDefinition({ name: name.trim(), area: area.trim() || undefined });
      }
      toast.success(editing ? 'Đã cập nhật' : 'Đã thêm vào thư viện');
      setSheetOpen(false);
      qc.invalidateQueries({ queryKey: ['cleaning', 'task-definitions'] });
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(def: ICleaningTaskDefinition) {
    try {
      await deleteCleaningTaskDefinition(def.id);
      toast.success('Đã xoá');
      qc.invalidateQueries({ queryKey: ['cleaning', 'task-definitions'] });
    } catch (err: any) {
      toast.error(extractApiError(err));
    }
  }

  return (
    <Screen scroll refreshing={isFetching} onRefresh={refetch}>
      <AppHeader
        title="Thư viện đầu việc"
        back
        actions={[{ icon: 'plus', onPress: openCreate }]}
      />

      {definitions.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Thư viện trống — bấm + để thêm đầu việc đầu tiên.</Text>
        </View>
      ) : (
        <View className="gap-2">
          {definitions.map((def) => (
            <Pressable
              key={def.id}
              onPress={() => openEdit(def)}
              className="flex-row items-center justify-between p-3 rounded-xl bg-bg dark:bg-surface-dark"
            >
              <View className="flex-1 pr-2">
                <Text className="font-semibold">{def.name}</Text>
                {def.area ? <Text variant="caption" tone="muted">{def.area}</Text> : null}
                {!def.isActive ? <Text variant="caption" tone="faint">Đã ẩn</Text> : null}
              </View>
              <Pressable onPress={() => handleDelete(def)} className="w-9 h-9 items-center justify-center">
                <Icon name="trash-can-outline" size={20} tone="error" />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      <Sheet
        visible={sheetOpen}
        title={editing ? 'Cập nhật đầu việc' : 'Thêm đầu việc'}
        onClose={() => setSheetOpen(false)}
        footer={
          <Button loading={busy} onPress={handleSave}>
            {editing ? 'Cập nhật' : 'Thêm vào thư viện'}
          </Button>
        }
      >
        <View className="gap-3">
          <TextField label="Tên đầu việc" value={name} onChangeText={setName} placeholder="Quét và lau sàn" />
          <TextField label="Khu vực (tuỳ chọn)" value={area} onChangeText={setArea} placeholder="Tầng 1" />
        </View>
      </Sheet>
    </Screen>
  );
}
