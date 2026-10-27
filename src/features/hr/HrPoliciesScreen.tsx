import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Button, Badge } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { openInAppBrowser } from 'src/features/assistant/links';
import { acknowledgePolicyDocument, getPolicyDocuments } from 'src/api/hr';
import type { IPolicyDocument } from 'src/types/hr';

// ----------------------------------------------------------------------
// Nội quy / quy chế / phụ lục cần đọc và xác nhận (Nội quy Điều 2, 32). Văn bản sửa = phiên bản mới, xác nhận lại.
// ----------------------------------------------------------------------

function DocumentCard({ doc, onAcknowledge }: { doc: IPolicyDocument; onAcknowledge: () => void }) {
  return (
    <SectionCard
      title={doc.title}
      right={
        doc.acknowledgedAt ? (
          <Badge tone="success">Đã xác nhận</Badge>
        ) : (
          <Badge tone="warning">Chưa xác nhận</Badge>
        )
      }
      bodyClassName="pt-0 gap-2"
    >
      <Text variant="caption" tone="muted">
        Bản {doc.version} · {dayjs(doc.publishedAt).format('DD/MM/YYYY')}
        {doc.acknowledgedAt ? ` · bạn xác nhận ${dayjs(doc.acknowledgedAt).format('HH:mm DD/MM')}` : ''}
      </Text>
      {doc.summary ? <Text variant="bodySmall">{doc.summary}</Text> : null}
      {doc.url ? (
        <Button size="sm" variant="outline" icon="open-in-new" onPress={() => openInAppBrowser(doc.url!)}>
          Đọc văn bản đầy đủ
        </Button>
      ) : null}
      {!doc.acknowledgedAt ? (
        <Button size="sm" icon="check-decagram-outline" onPress={onAcknowledge}>
          Tôi đã đọc và hiểu
        </Button>
      ) : null}
    </SectionCard>
  );
}

export function HrPoliciesScreen() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['hr', 'policies', 'active'], queryFn: () => getPolicyDocuments(false) });
  const docs = [...(query.data ?? [])].sort((a, b) => Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt));

  async function acknowledge(doc: IPolicyDocument) {
    const ok = await confirm({
      title: 'Xác nhận đã đọc',
      message: `Tôi đã đọc và hiểu "${doc.title}" (bản ${doc.version}).`,
      confirmText: 'Tôi đã đọc và hiểu',
    });
    if (!ok) return;
    try {
      await acknowledgePolicyDocument(doc.id);
      toast.success('Đã xác nhận.');
      qc.invalidateQueries({ queryKey: ['hr', 'policies'] });
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa xác nhận được');
    }
  }

  return (
    <Screen scroll refreshing={query.isFetching} onRefresh={query.refetch}>
      <AppHeader title="Nội quy & văn bản" back />
      {query.isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được văn bản: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && docs.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Chưa có văn bản nào.</Text>
        </View>
      ) : (
        docs.map((d) => <DocumentCard key={d.id} doc={d} onAcknowledge={() => acknowledge(d)} />)
      )}
    </Screen>
  );
}
