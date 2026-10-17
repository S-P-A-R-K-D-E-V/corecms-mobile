import axios, { endpoints } from 'src/api/axios';
import { newSsoState, redeemAppHubCode, type DiscoverResult } from 'src/api/app-hub';
import { setDiscovered, type Pending } from './discovery';
import { newPkce } from './web-sign-in';

// ----------------------------------------------------------------------
// "Đổi cửa hàng" không đăng nhập lại: phiên của cửa hàng hiện tại xin vé app-hub cho chính tài khoản
// (POST /auth/app-hub/handoff, gắn state + PKCE challenge), app đổi vé ở auth hub (app-hub/redeem, kèm verifier)
// lấy danh sách cửa hàng — cùng kết quả như đăng nhập Apple / Google / email — rồi sang màn chọn cửa hàng.
// Tài khoản là một người dùng chung cho mọi cửa hàng nên không mở thêm quyền gì.
// ----------------------------------------------------------------------

async function discoverWithSession(): Promise<{ state: string; result: DiscoverResult }> {
  const { verifier, challenge } = await newPkce();
  const state = newSsoState();
  const res = await axios.post<{ code: string }>(endpoints.auth.appHubHandoff, { state, codeChallenge: challenge });
  const result = await redeemAppHubCode(res.data.code, state, verifier);
  return { state, result };
}

/**
 * Danh sách cửa hàng của tài khoản đang đăng nhập → chờ chọn ở màn chọn cửa hàng. Vé SSO quá hạn (60 giây) thì
 * màn chọn tự xin lại bằng phiên hiện tại. Lỗi (máy chủ cũ chưa có endpoint, mất mạng…) → ném ra để màn gọi dùng
 * cách cũ: đăng xuất rồi đăng nhập.
 */
export async function discoverFromSession(): Promise<Pending> {
  const { state, result } = await discoverWithSession();
  return setDiscovered(state, 'session', result, null, discoverWithSession);
}
