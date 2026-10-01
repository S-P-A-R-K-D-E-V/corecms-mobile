import { View } from 'react-native';
import { router } from 'expo-router';

import { Screen, AppHeader } from 'src/components/shared';
import { Card, Text, Icon, Button, type IconName } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { isAdminUser, usesAdminShell } from 'src/auth/roles';
import { t } from 'src/i18n';

// ----------------------------------------------------------------------
// Tab Hàng hoá / Bán hàng / Hoá đơn trong lúc xây ERP trên app (giai đoạn 2–3): nói rõ sắp có gì và
// rằng KiotViet vẫn là hệ thống bán chính — không để tab trống.
// ----------------------------------------------------------------------

type Kind = 'products' | 'pos' | 'invoices';

const META: Record<Kind, { icon: IconName; phase: number; title: string; desc: string; points: string[] }> = {
  products: { icon: 'package-variant-closed', phase: 2, title: 'tabs.products', desc: 'erp.productsDesc', points: ['erp.products1', 'erp.products2', 'erp.products3'] },
  pos: { icon: 'cart-outline', phase: 3, title: 'tabs.pos', desc: 'erp.posDesc', points: ['erp.pos1', 'erp.pos2', 'erp.pos3'] },
  invoices: { icon: 'receipt', phase: 2, title: 'tabs.invoices', desc: 'erp.invoicesDesc', points: ['erp.invoices1', 'erp.invoices2', 'erp.invoices3'] },
};

export function ErpPlaceholderScreen({ kind }: { kind: Kind }) {
  const { user } = useAuthContext();
  const m = META[kind];

  return (
    <Screen scroll>
      {/* Chủ cửa hàng: đây là tab trên thanh; nhân viên mở từ Dùng nhanh/Tiện ích → cần nút quay lại. */}
      <AppHeader back={!usesAdminShell(user)} title={t(m.title)} />

      <Card className="p-5 gap-4">
        <View className="flex-row items-center gap-3">
          <View className="w-14 h-14 rounded-2xl bg-primary-soft items-center justify-center">
            <Icon name={m.icon} size={28} tone="primary" />
          </View>
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-1.5">
              <View className="rounded-full px-2 py-0.5 bg-warning-soft">
                <Text className="text-[10px] font-bold text-warning-text">{t('erp.building')}</Text>
              </View>
              <Text variant="caption" tone="muted">{t('erp.phase', { n: m.phase })}</Text>
            </View>
            <Text variant="bodySmall" tone="muted">{t(m.desc)}</Text>
          </View>
        </View>

        <View className="gap-2.5">
          {m.points.map((k) => (
            <View key={k} className="flex-row items-start gap-2.5">
              <Icon name="check-circle-outline" size={18} tone="primary" />
              <Text variant="bodySmall" className="flex-1">{t(k)}</Text>
            </View>
          ))}
        </View>

        <View className="flex-row items-start gap-2 rounded-xl bg-info-soft p-3">
          <Icon name="sync" size={16} tone="info" />
          <Text variant="caption" className="flex-1 text-info">{t('erp.syncNote')}</Text>
        </View>
      </Card>

      {isAdminUser(user) ? (
        <View className="gap-2">
          <Text variant="label" tone="muted">{t('erp.meanwhile')}</Text>
          <Button variant="soft" onPress={() => router.push('/(tabs)/admin' as any)}>
            {t('erp.openDashboard')}
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}
