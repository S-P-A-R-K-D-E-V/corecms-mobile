import { signContract } from 'src/api/hr';
import axios from 'src/api/axios';
import {
  MAX_POINTS,
  MAX_STROKES,
  extendStroke,
  hasSignature,
  pointCount,
  signPayload,
  startStroke,
  strokePath,
} from '../signature-strokes';
import { awaitingMySignature, contractStatusText, contractText, htmlToText } from '../contract-text';
import type { SignatureStroke } from 'src/types/hr';

// Ký hợp đồng trên app: ghi nét vẽ → dữ liệu gửi core-be (POST employment-contracts/{id}/sign), chữ hợp đồng từ HTML.

jest.mock('src/api/axios', () => {
  const actual = jest.requireActual('src/api/axios');
  return { __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, endpoints: actual.endpoints };
});

const mockAxios = axios as unknown as { get: jest.Mock; post: jest.Mock; put: jest.Mock };

afterEach(() => jest.clearAllMocks());

/** Vẽ một nét qua các điểm như PanResponder gọi: grant rồi move. */
function draw(strokes: SignatureStroke[], points: [number, number][]): SignatureStroke[] {
  const [[x0, y0], ...rest] = points;
  let next = startStroke(strokes, x0, y0);
  for (const [x, y] of rest) next = extendStroke(next, x, y);
  return next;
}

describe('nét chữ ký', () => {
  it('mỗi lần chạm là một nét; bỏ điểm sát điểm trước; làm tròn 0,1', () => {
    let strokes = draw([], [[10, 10], [10.5, 10.4], [20.04, 30.06], [40, 50]]);
    strokes = draw(strokes, [[100, 20]]);

    expect(strokes).toEqual([
      [[10, 10], [20, 30.1], [40, 50]],
      [[100, 20]],
    ]);
    expect(pointCount(strokes)).toBe(4);
    expect(strokePath(strokes[0])).toBe('M 10 10 L 20 30.1 L 40 50');
    expect(strokePath(strokes[1])).toBe('M 100 20 l 0.1 0.1');
  });

  it('chỉ có chấm thì chưa coi là đã ký', () => {
    expect(hasSignature(draw([], [[5, 5]]))).toBe(false);
    expect(hasSignature(draw([], [[5, 5], [15, 5], [25, 9]]))).toBe(true);
  });

  it('không vượt giới hạn nét / điểm của core-be', () => {
    let strokes: SignatureStroke[] = [];
    for (let i = 0; i < MAX_STROKES + 5; i++) strokes = startStroke(strokes, i, i);
    expect(strokes).toHaveLength(MAX_STROKES);

    let long: SignatureStroke[] = startStroke([], 0, 0);
    for (let i = 1; i < MAX_POINTS + 50; i++) long = extendStroke(long, i * 2, 0);
    expect(pointCount(long)).toBe(MAX_POINTS);
  });

  it('dữ liệu gửi: kẹp toạ độ trong khung, khung làm tròn, agree = true', () => {
    const payload = signPayload([[[-3, 5], [320.4, 200]], []], 319.6, 170.2);
    expect(payload).toEqual({ strokes: [[[0, 5], [320, 170]]], width: 320, height: 170, agree: true });
  });

  it('gửi đúng đường dẫn ký', async () => {
    mockAxios.post.mockResolvedValue({ data: { id: 'c1', employeeSignedAt: '2026-10-29T08:00:00Z' } });
    const body = signPayload(draw([], [[10, 10], [30, 30], [50, 20]]), 300, 160);

    const signed = await signContract('c1', body);

    expect(mockAxios.post).toHaveBeenCalledWith('/employment-contracts/c1/sign', {
      strokes: [[[10, 10], [30, 30], [50, 20]]],
      width: 300,
      height: 160,
      agree: true,
    });
    expect(signed.employeeSignedAt).toBe('2026-10-29T08:00:00Z');
  });
});

describe('chữ hợp đồng trên app', () => {
  it('HTML → chữ thuần: đoạn, bảng, ngắt trang, ký tự thoát', () => {
    const html =
      '<h1>HỢP ĐỒNG</h1><p>Bên A &amp; Bên B</p><table><tr><td>Họ tên</td><td>Lan</td></tr></table>' +
      '<div class="page-break"></div><p>Điều 1.</p>';
    expect(htmlToText(html)).toBe('HỢP ĐỒNG\nBên A & Bên B\nHọ tên | Lan\n\nĐiều 1.');
  });

  it('ưu tiên bodyText của server; đổi chỗ ký thành chữ đọc được', () => {
    expect(contractText({ bodyText: 'Bên B ký: {{chu_ky_nguoi_lao_dong}}', isHtml: true, renderedBody: '<p>x</p>' }))
      .toBe('Bên B ký: (chữ ký người lao động)');
    expect(contractText({ bodyText: null, isHtml: true, renderedBody: '<p>Điều 1</p><p>Điều 2</p>' })).toBe('Điều 1\nĐiều 2');
    expect(contractText({ renderedBody: 'Điều 9.\n[[CHU_KY]]' })).not.toContain('[[');
  });

  it('chờ chính nhân viên ký cho tới khi đã ký', () => {
    expect(awaitingMySignature({ status: 'AwaitingSignature', employeeSignedAt: null })).toBe(true);
    expect(awaitingMySignature({ status: 'AwaitingSignature', employeeSignedAt: '2026-10-29T08:00:00Z' })).toBe(false);
    expect(awaitingMySignature({ status: 'Draft' })).toBe(false);
    expect(contractStatusText({ status: 'AwaitingSignature', employeeSignedAt: '2026-10-29T08:00:00Z' }))
      .toBe('Nhân viên đã ký — chờ cửa hàng ký');
    expect(contractStatusText({ status: 'AwaitingSignature' })).toBe('Chờ ký');
  });
});
