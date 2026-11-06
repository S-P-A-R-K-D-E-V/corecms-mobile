import { useMemo } from 'react';

import { useAuthContext, type AuthUser } from 'src/auth/auth-context';
import { useWorkingBranch } from 'src/features/branch/working-branch';
import { useCounterMode } from 'src/services/counter-mode';
import { useAssistantAccess } from 'src/features/assistant/assistant-access';

import { featureContext, type FeatureContext } from './registry';

// ----------------------------------------------------------------------
// Ngữ cảnh hiện tiện ích (FeatureItem.visible) lấy từ trạng thái app: loại hình của chi nhánh máy đang làm việc
// + tính năng cửa hàng bật. Tách khỏi registry.ts để danh mục tiện ích vẫn là phần thuần (test được).
// ----------------------------------------------------------------------

/** Trong màn hình: tự cập nhật khi đổi chi nhánh đang làm việc hoặc nạp lại người dùng. */
export function useFeatureContext(): FeatureContext {
  const { user } = useAuthContext();
  const branchType = useWorkingBranch((s) => s.branch?.type ?? null);
  const counter = useCounterMode((s) => !!s.device);
  // Trợ lý AI của nhân viên do máy chủ trả lời (assistant-access); đổi kết quả thì dựng lại ngữ cảnh để ô Trợ lý hiện ra.
  const assistant = useAssistantAccess(user).allowed;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => featureContext(user, branchType, counter), [user, branchType, counter, assistant]);
}

/** Ngoài màn hình (vd trợ lý dựng nút mở màn): đọc chi nhánh đang làm việc ngay lúc gọi. */
export function currentFeatureContext(user: AuthUser | null | undefined): FeatureContext {
  return featureContext(user, useWorkingBranch.getState().branch?.type ?? null, !!useCounterMode.getState().device);
}
