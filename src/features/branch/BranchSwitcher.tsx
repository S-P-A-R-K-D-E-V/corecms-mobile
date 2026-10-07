import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Text } from 'src/components/ui';
import { haptics } from 'src/services/haptics';
import { t } from 'src/i18n';

import { canSwitchBranch, useWorkingBranch } from './working-branch';
import { WorkingBranchSheet } from './WorkingBranchSheet';

const WHITE_85 = 'rgba(255,255,255,0.85)';
const WHITE_18 = 'rgba(255,255,255,0.18)';

/**
 * Chi nhánh đang làm việc ở đầu màn hình (Home, Chấm công). Đổi chi nhánh → tiện ích, màn Bán hàng (bán lẻ / sơ đồ
 * bàn F&B) và chấm công đi theo chi nhánh mới. Chỉ một lựa chọn (nhân viên được phân công một chi nhánh, cửa hàng một
 * chi nhánh) → chỉ hiện tên, không bấm được. Chưa chọn → nhắc "Chọn chi nhánh".
 * `inverse`: chữ trắng trên nền màu thương hiệu (đầu Home).
 */
export function BranchSwitcher({ inverse = false }: { inverse?: boolean }) {
  const branch = useWorkingBranch((s) => s.branch);
  const options = useWorkingBranch((s) => s.options);
  const needsPick = useWorkingBranch((s) => s.needsPick);
  const [open, setOpen] = useState(false);

  const switchable = canSwitchBranch(options);
  // Cửa hàng không có chi nhánh nào (hoặc chưa hỏi được mà máy cũng chưa lưu) → không hiện gì.
  if (!branch && !needsPick) return null;

  const label = branch?.name ?? t('branch.pickShort');
  const color = inverse ? WHITE_85 : undefined;

  return (
    <>
      <Pressable
        disabled={!switchable}
        onPress={() => {
          haptics.selection();
          setOpen(true);
        }}
        accessibilityRole={switchable ? 'button' : 'text'}
        accessibilityLabel={switchable ? t('branch.switchA11y', { name: label }) : label}
        hitSlop={8}
        className="self-start mt-1"
      >
        <View
          className={inverse ? 'flex-row items-center rounded-full px-2.5 py-1' : 'flex-row items-center rounded-full px-2.5 py-1 bg-surface dark:bg-surface-dark'}
          style={inverse ? { backgroundColor: WHITE_18 } : undefined}
        >
          <Icon name="storefront-outline" size={14} tone={inverse ? undefined : needsPick ? 'warning' : 'primary'} color={color} />
          <Text
            variant="caption"
            tone={inverse ? undefined : needsPick ? 'warning' : 'default'}
            style={inverse ? { color: WHITE_85 } : undefined}
            className="ml-1 font-semibold"
            numberOfLines={1}
          >
            {label}
          </Text>
          {switchable ? (
            <Icon name="chevron-down" size={14} tone={inverse ? undefined : 'muted'} color={color} />
          ) : null}
        </View>
      </Pressable>
      <WorkingBranchSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
