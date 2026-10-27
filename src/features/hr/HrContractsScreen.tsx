import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Button, Badge } from 'src/components/ui';
import { extractApiError } from 'src/services/error';
import { getStorageUrl } from 'src/api/axios';
import { openInAppBrowser } from 'src/features/assistant/links';
import { getMyContracts } from 'src/api/hr';
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_TYPE_LABEL,
  type EmploymentContractStatus,
  type IEmploymentContract,
} from 'src/types/hr';

// ----------------------------------------------------------------------
// Hợp đồng lao động của tôi — CHỈ XEM. Admin quản lý nhân sự soạn, in, ký giấy, lưu bản gốc và tải bản ký lên trên web;
// app chỉ hiện nội dung và mở bản ký (link có chữ ký, kho riêng tư).
// ----------------------------------------------------------------------

const STATUS_TONE: Record<EmploymentContractStatus, 'neutral' | 'warning' | 'success' | 'info' | 'error'> = {
  Draft: 'neutral',
  AwaitingSignature: 'warning',
  Signed: 'success',
  Terminated: 'info',
  Voided: 'error',
};

const d = (iso?: string | null) => (iso ? dayjs(iso).format('DD/MM/YYYY') : '');

/** Bỏ dấu định dạng in (`[[NGAT_TRANG]]`, `[[CHU_KY]]`) khi hiện nội dung trên app. */
export function readableBody(body: string): string {
  return body
    .replace(/^[ \t]*\[\[NGAT_TRANG\]\][ \t]*$/gm, '')
    .replace(/^[ \t]*\[\[CHU_KY\]\][ \t]*$/gm, 'NGƯỜI LAO ĐỘNG — NGƯỜI SỬ DỤNG LAO ĐỘNG\n(ký, ghi rõ họ tên trên bản giấy)');
}

function ContractCard({ contract: c }: { contract: IEmploymentContract }) {
  const [open, setOpen] = useState(false);
  return (
    <SectionCard
      title={`Hợp đồng số ${c.contractNumber ?? ''}`}
      right={<Badge tone={STATUS_TONE[c.status]}>{CONTRACT_STATUS_LABEL[c.status]}</Badge>}
      bodyClassName="pt-0 gap-2"
    >
      <Text variant="caption" tone="muted">
        {CONTRACT_TYPE_LABEL[c.contractType]} · {d(c.startDate)} – {c.endDate ? d(c.endDate) : 'không thời hạn'}
        {c.signedOn ? ` · ký ngày ${d(c.signedOn)}` : ''}
        {c.terminatedOn ? ` · chấm dứt ${d(c.terminatedOn)}` : ''}
      </Text>
      {c.status === 'AwaitingSignature' ? (
        <Text variant="caption" tone="warning" className="font-semibold">
          Hợp đồng đã soạn xong — đọc trước, rồi ký bản giấy với chủ hộ.
        </Text>
      ) : null}
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
      {open ? <Text variant="bodySmall">{readableBody(c.renderedBody)}</Text> : null}
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
        Chỉ để xem. Bản gốc ký tay do cửa hàng lưu giữ; cần sửa thông tin thì báo chủ hộ.
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
