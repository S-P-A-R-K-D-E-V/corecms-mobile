import React from 'react';

import { Screen, EmptyState } from 'src/components/shared';

import { usePlatformFeatureAllowed } from './use-platform-feature';

// ----------------------------------------------------------------------
// Màn của tính năng chủ cửa hàng tắt được trên app theo vai trò (Cài đặt cửa hàng → Tính năng web / app): bị tắt với người
// này thì báo thay vì gọi API rồi nhận 403. API vẫn tự chặn.

type Props = {
  feature: string;
  /** Tên tính năng trong thông báo, vd "Kiểm quầy". */
  label: string;
  children: React.ReactNode;
};

export function PlatformFeatureBlocked({ label }: { label: string }) {
  return (
    <Screen>
      <EmptyState
        icon="cellphone-off"
        title={`${label} trên app đã tắt`}
        description="Cửa hàng không cho bạn dùng tính năng này trên app. Hãy dùng trên web hoặc máy quầy, hoặc hỏi quản lý."
      />
    </Screen>
  );
}

export function PlatformFeatureGate({ feature, label, children }: Props) {
  if (!usePlatformFeatureAllowed(feature)) return <PlatformFeatureBlocked label={label} />;
  return <>{children}</>;
}
