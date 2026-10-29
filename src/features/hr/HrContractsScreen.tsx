import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SvgXml } from 'react-native-svg';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Button, Badge } from 'src/components/ui';
import { extractApiError } from 'src/services/error';
import { getStorageUrl } from 'src/api/axios';
import { openInAppBrowser } from 'src/features/assistant/links';
import { getWebOrigin, isMultiStore, storeDomain } from 'src/services/store-config';
import { getMyContracts } from 'src/api/hr';
import { CONTRACT_TYPE_LABEL, type EmploymentContractStatus, type IEmploymentContract } from 'src/types/hr';
import { awaitingMySignature, contractStatusText, contractText } from './contract-text';

export { readableBody } from './contract-text';

// ----------------------------------------------------------------------
// Hợp đồng lao động của tôi: Admin soạn và chốt trên web; nhân viên đọc rồi ký trên app (vẽ chữ ký + cam kết thông tin hồ
// sơ đúng). Phía cửa hàng ký sau. Bản giấy đã ký (nếu có) mở bằng link có chữ ký (kho riêng tư).
// ----------------------------------------------------------------------

const STATUS_TONE: Record<EmploymentContractStatus, 'neutral' | 'warning' | 'success' | 'info' | 'error'> = {
  Draft: 'neutral',
  AwaitingSignature: 'warning',
  Signed: 'success',
  Terminated: 'info',
  Voided: 'error',
};

const d = (iso?: string | null) => (iso ? dayjs(iso).format('DD/MM/YYYY') : '');

/** Trang Hợp đồng của tôi trên web của cửa hàng đang gắn (bản đầy đủ có định dạng). null khi chưa gắn cửa hàng. */
function webContractsUrl(): string | null {
  if (isMultiStore && !storeDomain()) return null;
  return `${getWebOrigin().replace(/\/+$/, '')}/dashboard/hr/contracts?tab=mine`;
}

/** Chữ ký nhân viên đã ký (SVG do server dựng) + thời điểm ký. */
export function EmployeeSignature({ contract: c }: { contract: IEmploymentContract }) {
  if (!c.employeeSignedAt) return null;
  return (
    <View className="gap-1">
      <Text variant="caption" tone="success" className="font-semibold">
        Bạn đã ký ngày {dayjs(c.employeeSignedAt).format('DD/MM/YYYY HH:mm')}
      </Text>
      {c.employeeSignatureSvg ? (
        <View className="rounded-xl bg-white border border-line dark:border-line-dark p-2" style={{ height: 96 }}>
          <SvgXml xml={c.employeeSignatureSvg} width="100%" height="100%" />
        </View>
      ) : null}
    </View>
  );
}

function ContractCard({ contract: c }: { contract: IEmploymentContract }) {
  const [open, setOpen] = useState(false);
  const webUrl = webContractsUrl();
  return (
    <SectionCard
      title={c.contractNumber ? `Hợp đồng số ${c.contractNumber}` : CONTRACT_TYPE_LABEL[c.contractType]}
      right={<Badge tone={c.employeeSignedAt && c.status === 'AwaitingSignature' ? 'info' : STATUS_TONE[c.status]}>{contractStatusText(c)}</Badge>}
      bodyClassName="pt-0 gap-2"
    >
      <Text variant="caption" tone="muted">
        {CONTRACT_TYPE_LABEL[c.contractType]} · {d(c.startDate)} – {c.endDate ? d(c.endDate) : 'không thời hạn'}
        {c.signedOn ? ` · ký ngày ${d(c.signedOn)}` : ''}
        {c.terminatedOn ? ` · chấm dứt ${d(c.terminatedOn)}` : ''}
      </Text>
      {awaitingMySignature(c) ? (
        <>
          <Text variant="caption" tone="warning" className="font-semibold">
            Hợp đồng đã soạn xong — đọc kỹ rồi ký trên app.
          </Text>
          <Button size="sm" icon="draw-pen" onPress={() => router.push({ pathname: '/hr/contract-sign/[id]' as any, params: { id: c.id } })}>
            Ký hợp đồng
          </Button>
        </>
      ) : null}
      <EmployeeSignature contract={c} />
      {c.files.map((f, i) => (
        <Button
          key={f.id}
          size="sm"
          variant="outline"
          icon={f.contentType === 'application/pdf' ? 'file-pdf-box' : 'image-outline'}
          onPress={() => openInAppBrowser(getStorageUrl(f.url))}
        >
          {`Bản đã ký · trang ${i + 1}`}
        </Button>
      ))}
      <Button size="sm" variant="ghost" icon={open ? 'chevron-up' : 'chevron-down'} onPress={() => setOpen((v) => !v)}>
        {open ? 'Ẩn nội dung' : 'Xem nội dung hợp đồng'}
      </Button>
      {open ? <Text variant="bodySmall">{contractText(c)}</Text> : null}
      {open && webUrl ? (
        <Button size="sm" variant="ghost" icon="open-in-new" onPress={() => openInAppBrowser(webUrl)}>
          Xem bản đầy đủ trên web
        </Button>
      ) : null}
    </SectionCard>
  );
}

export function HrContractsScreen() {
  const query = useQuery({ queryKey: ['hr', 'contracts'], queryFn: getMyContracts });
  const list = query.data ?? [];

  return (
    <Screen scroll refreshing={query.isFetching} onRefresh={query.refetch}>
      <AppHeader title="Hợp đồng của tôi" back />
      <Text variant="caption" tone="muted">
        Đọc kỹ trước khi ký. Thông tin hồ sơ sai thì báo chủ hộ sửa trước khi ký.
      </Text>
      {query.isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được hợp đồng: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && list.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Chưa có hợp đồng nào.</Text>
        </View>
      ) : (
        list.map((c) => <ContractCard key={c.id} contract={c} />)
      )}
    </Screen>
  );
}
