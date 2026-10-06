import { Sheet, ListItem } from 'src/components/shared';
import { Text, Icon } from 'src/components/ui';
import { haptics } from 'src/services/haptics';
import { t } from 'src/i18n';

import { useWorkingBranch, type WorkingBranch } from './working-branch';

/**
 * Bảng chọn chi nhánh đang làm việc của máy (cửa hàng có nhiều chi nhánh). Chỉ hiện tên chi nhánh — loại hình
 * không hiện ra ngoài. Chọn xong tự đóng; `onPicked` cho màn gọi làm tiếp việc đang dở (vd mở thanh toán).
 */
export function WorkingBranchSheet({
  visible,
  onClose,
  onPicked,
}: {
  visible: boolean;
  onClose: () => void;
  onPicked?: (branch: WorkingBranch) => void;
}) {
  const branch = useWorkingBranch((s) => s.branch);
  const options = useWorkingBranch((s) => s.options);
  const needsPick = useWorkingBranch((s) => s.needsPick);
  const select = useWorkingBranch((s) => s.select);

  return (
    <Sheet visible={visible} title={t('branch.pickTitle')} onClose={onClose}>
      <Text variant="bodySmall" tone={needsPick === 'gone' ? 'warning' : 'muted'} className="mb-1">
        {needsPick === 'gone' ? t('branch.gone') : t('branch.pickHint')}
      </Text>
      {(options ?? []).map((b) => {
        const on = b.id === branch?.id;
        return (
          <ListItem
            key={b.id}
            title={b.name}
            icon="office-building-outline"
            iconTone={on ? 'primary' : 'muted'}
            right={on ? <Icon name="check-circle" tone="primary" size={20} /> : null}
            onPress={() => {
              haptics.selection();
              select(b.id);
              onClose();
              onPicked?.(b);
            }}
          />
        );
      })}
    </Sheet>
  );
}
