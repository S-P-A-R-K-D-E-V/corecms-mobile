import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Button, Icon, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getMyContracts, signContract } from 'src/api/hr';
import { CONTRACT_SIGN_CONSENT, CONTRACT_TYPE_LABEL, type SignatureStroke } from 'src/types/hr';
import { awaitingMySignature, contractText } from './contract-text';
import { EmployeeSignature } from './HrContractsScreen';
import { SignaturePad } from './SignaturePad';
import { hasSignature, signPayload } from './signature-strokes';

// ----------------------------------------------------------------------
// Ký hợp đồng (nhân viên): đọc nội dung (khung cuộn riêng), vẽ chữ ký trong khung ký (nằm ngoài vùng cuộn nên vẽ không
// làm cuộn màn), đánh dấu lời cam kết rồi ký. Gửi nét vẽ — server tự dựng SVG chữ ký. Phía cửa hàng ký sau.
// ----------------------------------------------------------------------

export function HrContractSignScreen({ id }: { id: string }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['hr', 'contracts'], queryFn: getMyContracts });
  const contract = (query.data ?? []).find((c) => c.id === id);

  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSign = !!contract && awaitingMySignature(contract) && hasSignature(strokes) && agree && !!size && !busy;

  async function sign() {
    if (!contract || !size || !canSign) return;
    setBusy(true);
    try {
      await signContract(contract.id, signPayload(strokes, size.width, size.height));
      toast.success('Đã ký hợp đồng. Cửa hàng sẽ ký sau.');
      await qc.invalidateQueries({ queryKey: ['hr', 'contracts'] });
      router.back();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa ký được');
    } finally {
      setBusy(false);
    }
  }

  const header = <AppHeader title="Ký hợp đồng" back />;

  if (!contract) {
    return (
      <Screen header={header} tabBarInset={false}>
        <View className="py-10 items-center gap-3">
          {query.isError ? (
            <Text variant="bodySmall" tone="error">Không tải được hợp đồng: {extractApiError(query.error)}</Text>
          ) : (
            <Text variant="bodySmall" tone="muted">{query.isLoading ? 'Đang tải…' : 'Không tìm thấy hợp đồng.'}</Text>
          )}
        </View>
      </Screen>
    );
  }

  const title = contract.contractNumber ? `Hợp đồng số ${contract.contractNumber}` : CONTRACT_TYPE_LABEL[contract.contractType];

  if (!awaitingMySignature(contract)) {
    return (
      <Screen header={header} tabBarInset={false}>
        <SectionCard title={title} bodyClassName="pt-0 gap-2">
          <Text variant="bodySmall" tone="muted">Hợp đồng này không còn chờ bạn ký.</Text>
          <EmployeeSignature contract={contract} />
        </SectionCard>
      </Screen>
    );
  }

  return (
    <Screen header={header} tabBarInset={false} contentClassName="gap-3">
      <View className="flex-1 rounded-2xl bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark overflow-hidden">
        <ScrollView contentContainerClassName="p-4 gap-2">
          <Text variant="subtitle">{title}</Text>
          <Text variant="bodySmall">{contractText(contract)}</Text>
        </ScrollView>
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text variant="caption" tone="muted" className="font-semibold">Chữ ký của bạn</Text>
          <Button size="sm" variant="ghost" fullWidth={false} icon="eraser" disabled={busy || strokes.length === 0} onPress={() => setStrokes([])}>
            Xoá ký lại
          </Button>
        </View>
        <SignaturePad
          strokes={strokes}
          onChange={setStrokes}
          onSize={(width, height) => setSize({ width, height })}
          height={170}
          disabled={busy}
        />
        <Pressable onPress={() => setAgree((v) => !v)} disabled={busy} className="flex-row items-start gap-2 py-1" testID="sign-consent">
          <Icon name={agree ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} tone={agree ? 'primary' : 'muted'} />
          <Text variant="bodySmall" className="flex-1">{CONTRACT_SIGN_CONSENT}</Text>
        </Pressable>
        <Button icon="draw-pen" loading={busy} disabled={!canSign} onPress={sign}>
          {hasSignature(strokes) ? 'Ký hợp đồng' : 'Vẽ chữ ký để ký'}
        </Button>
      </View>
    </Screen>
  );
}
