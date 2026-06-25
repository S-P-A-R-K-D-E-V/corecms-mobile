import { View } from 'react-native';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Icon, Pressable, Divider } from 'src/components/ui';
import { useFontSettings, type FontFamilyPref, type FontScaleKey } from 'src/theme/FontProvider';

const FAMILIES: { value: FontFamilyPref; label: string; hint: string }[] = [
  { value: 'system', label: 'Hệ thống', hint: 'Mặc định — độ đậm chuẩn theo thiết bị' },
  { value: 'publicSans', label: 'Public Sans', hint: 'Đồng bộ với bản web (core-fe)' },
];

const SIZES: { value: FontScaleKey; label: string }[] = [
  { value: 'small', label: 'Nhỏ' },
  { value: 'medium', label: 'Vừa (mặc định)' },
  { value: 'large', label: 'Lớn' },
  { value: 'xlarge', label: 'Rất lớn' },
];

function Row({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-3.5">
      <View className="flex-1">
        <Text variant="body" className="font-medium">{label}</Text>
        {hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}
      </View>
      {selected ? <Icon name="check-circle" size={22} tone="primary" /> : null}
    </Pressable>
  );
}

export function FontSettingsScreen() {
  const { family, scaleKey, setFamily, setScaleKey } = useFontSettings();

  return (
    <Screen scroll>
      <AppHeader title="Phông chữ & cỡ chữ" back />

      {/* Live preview */}
      <SectionCard title="Xem trước" bodyClassName="pt-0">
        <Text variant="title2">Xin chào, Dương 👋</Text>
        <Text tone="muted" className="mt-1.5">
          Đây là đoạn văn bản mẫu để bạn xem trước phông chữ và cỡ chữ đang chọn.
        </Text>
      </SectionCard>

      <SectionCard title="Phông chữ" bodyClassName="pt-0">
        {FAMILIES.map((opt, i) => (
          <View key={opt.value}>
            {i > 0 ? <Divider /> : null}
            <Row label={opt.label} hint={opt.hint} selected={family === opt.value} onPress={() => setFamily(opt.value)} />
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Cỡ chữ" bodyClassName="pt-0">
        {SIZES.map((opt, i) => (
          <View key={opt.value}>
            {i > 0 ? <Divider /> : null}
            <Row label={opt.label} selected={scaleKey === opt.value} onPress={() => setScaleKey(opt.value)} />
          </View>
        ))}
      </SectionCard>
    </Screen>
  );
}
