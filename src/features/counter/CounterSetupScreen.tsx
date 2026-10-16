import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { Screen, SectionCard, ListItem } from 'src/components/shared';
import { Text, Button, Icon, TextField, Spinner } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { getBranchLocations } from 'src/api/attendance';
import { provisionCounterDevice } from 'src/api/counter';
import { enterCounterMode } from 'src/services/counter-mode';
import { getStoreCode } from 'src/services/store-config';
import { extractApiError } from 'src/services/error';

// ----------------------------------------------------------------------
// Đặt máy này làm máy quầy (chủ cửa hàng / quản lý, trên chính POS/tablet ở quầy): chọn chi nhánh + đặt tên →
// server cấp key thiết bị → máy chuyển sang màn chọn nhân viên. Người đang đăng nhập được đăng xuất (máy quầy dùng
// chung, không giữ phiên 30 ngày của quản lý) và có thể đăng nhập lại bằng mã như mọi người.

export function CounterSetupScreen() {
  const { user, logout } = useAuthContext();
  const isManager =
    user?.role === 'Admin' || user?.role === 'Manager' || (user?.roles ?? []).some((r) => r === 'Admin' || r === 'Manager');

  const [name, setName] = useState('Quầy 1');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchesQ = useQuery({ queryKey: ['branches'], queryFn: getBranchLocations, staleTime: 60 * 60 * 1000 });
  // Quản lý chỉ thấy chi nhánh mình được làm (server cũng kiểm tra).
  const branches = useMemo(() => {
    const all = branchesQ.data ?? [];
    const scope = user?.branchScope;
    return scope && !scope.allBranches ? all.filter((b) => scope.branchIds.includes(String(b.id))) : all;
  }, [branchesQ.data, user?.branchScope]);
  const branchName = branches.find((b) => b.id === branchId)?.branchName ?? '';

  async function handleSubmit() {
    if (!branchId || !name.trim()) return;
    const ok = await confirm({
      title: 'Đặt làm máy quầy?',
      message:
        `Máy này sẽ thành máy quầy của ${branchName}. Bạn sẽ được đăng xuất; nhân viên có ca chọn tên và nhập mã gửi về ` +
        'app điện thoại của họ để đăng nhập. Muốn thôi, chủ cửa hàng / quản lý đăng nhập trên máy rồi vào Hồ sơ → Thoát chế độ máy quầy.',
      confirmText: 'Đặt làm máy quầy',
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const res = await provisionCounterDevice(branchId, name.trim());
      // Đăng xuất TRƯỚC khi bật chế độ máy quầy: còn token của quản lý để huỷ đăng ký thông báo trên máy này.
      try { await logout(); } catch {}
      await enterCounterMode(
        { deviceId: res.deviceId, deviceName: res.deviceName, branchId: res.branchId, branchName: res.branchName, storeCode: getStoreCode() },
        res.deviceKey
      );
      toast.success(`${res.deviceName} · ${res.branchName}`, 'Đã đặt máy quầy');
      router.replace('/counter' as any);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  }

  if (!isManager) {
    return (
      <Screen tabBarInset={false}>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Icon name="lock-outline" size={48} tone="muted" />
          <Text tone="muted" className="text-center">Cần quyền chủ cửa hàng hoặc quản lý để đặt máy quầy.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll tabBarInset={false}>
      <SectionCard title="Đặt máy này làm máy quầy" bodyClassName="gap-3">
        <Text tone="muted">
          Dùng cho POS / tablet đặt cố định ở quầy. Mở app là danh sách nhân viên có ca hôm nay; bấm tên → mã 6 số gửi về
          app điện thoại của người đó → nhập mã để đăng nhập. Tự đăng xuất khi hết ca (thêm 30 phút).
        </Text>
        <TextField label="Tên máy quầy" value={name} onChangeText={setName} placeholder="VD: Quầy thu ngân" maxLength={100} />
      </SectionCard>

      <SectionCard title="Chi nhánh" bodyClassName="pt-0">
        {branchesQ.isLoading ? (
          <View className="py-4 items-center"><Spinner /></View>
        ) : (
          branches.map((b) => (
            <ListItem
              key={b.id}
              title={b.branchName}
              icon="office-building-outline"
              iconTone={branchId === b.id ? 'primary' : 'muted'}
              right={branchId === b.id ? <Icon name="check-circle" tone="primary" size={20} /> : null}
              onPress={() => setBranchId(b.id)}
            />
          ))
        )}
      </SectionCard>

      {error ? <Text tone="error" className="text-center">{error}</Text> : null}

      <View className="gap-2 px-1">
        <Button disabled={!branchId || !name.trim()} loading={saving} onPress={handleSubmit}>
          Đặt làm máy quầy
        </Button>
        <Button variant="outline" action="neutral" onPress={() => router.back()}>Huỷ</Button>
      </View>
    </Screen>
  );
}
