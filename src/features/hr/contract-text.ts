import { CONTRACT_STATUS_LABEL, type IEmploymentContract } from 'src/types/hr';

// ----------------------------------------------------------------------
// Nội dung hợp đồng trên app (phần thuần, test được). Mẫu mới là HTML — server trả kèm bodyText (chữ thuần) để app hiện;
// backend cũ chưa có bodyText thì tự bỏ thẻ HTML. Dấu định dạng in và chỗ ký được đổi thành chữ đọc được.
// ----------------------------------------------------------------------

const SIGN_LINE = 'NGƯỜI LAO ĐỘNG — NGƯỜI SỬ DỤNG LAO ĐỘNG\n(chữ ký hai bên)';

/** Bỏ dấu định dạng in (`[[NGAT_TRANG]]`, `[[CHU_KY]]`) và trường chữ ký khi hiện nội dung trên app. */
export function readableBody(body: string): string {
  return body
    .replace(/^[ \t]*\[\[NGAT_TRANG\]\][ \t]*$/gm, '')
    .replace(/^[ \t]*\[\[CHU_KY\]\][ \t]*$/gm, SIGN_LINE)
    .replace(/\{\{\s*chu_ky_nguoi_lao_dong\s*\}\}/g, '(chữ ký người lao động)')
    .replace(/\{\{\s*chu_ky_cua_hang\s*\}\}/g, '(chữ ký cửa hàng)');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** HTML → chữ thuần (dự phòng khi server chưa trả bodyText): khối xuống dòng, ô bảng cách " | ". */
export function htmlToText(html: string): string {
  return html
    .replace(/<div[^>]*class="[^"]*page-break[^"]*"[^>]*>\s*<\/div>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>\s*(?=<t[dh][\s>])/gi, ' | ')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#39|[a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Chữ hiện trên app: bodyText của server, không có thì tự chuyển từ nội dung. */
export function contractText(c: Pick<IEmploymentContract, 'bodyText' | 'isHtml' | 'renderedBody'>): string {
  const text = c.bodyText?.trim() ? c.bodyText : c.isHtml ? htmlToText(c.renderedBody) : c.renderedBody;
  return readableBody(text);
}

/** Hợp đồng đã chốt, đang chờ chính nhân viên ký. */
export function awaitingMySignature(c: Pick<IEmploymentContract, 'status' | 'employeeSignedAt'>): boolean {
  return c.status === 'AwaitingSignature' && !c.employeeSignedAt;
}

export function contractStatusText(c: Pick<IEmploymentContract, 'status' | 'employeeSignedAt'>): string {
  return c.status === 'AwaitingSignature' && c.employeeSignedAt
    ? 'Nhân viên đã ký — chờ cửa hàng ký'
    : CONTRACT_STATUS_LABEL[c.status];
}
