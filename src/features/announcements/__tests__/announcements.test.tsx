import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import {
  CHECK_INTERVAL_MS,
  announcementBlocks,
  announcementCta,
  imageRatio,
  isAnnouncementPush,
  mergeQueue,
  plainSpans,
  scrollMaxHeight,
  shouldCheck,
} from '../announcement-logic';
import { AnnouncementHost } from '../AnnouncementHost';

// ----------------------------------------------------------------------
// Popup thông báo trên app: hàng đợi, giãn cách, đóng bằng nút khi bắt buộc xác nhận, nút hành động không mở link ngoài.
// ----------------------------------------------------------------------

// Máy bận (chạy cả bộ test song song): dựng lần đầu có thể quá mức chờ mặc định 1 giây.
configure({ asyncUtilTimeout: 5000 });

const mockUser: { current: any } = { current: { id: 'u1', roles: ['Staff'] } };
const mockCounter: { current: any } = { current: null };
const mockGetPending = jest.fn();
const mockSeen = jest.fn();
const mockAck = jest.fn();
const mockImageUrl = jest.fn();
const mockPush = jest.fn();
const mockOpenBrowser = jest.fn();
const mockToastError = jest.fn();
const mockReceived: ((n: any) => void)[] = [];
const appStateListeners: ((s: string) => void)[] = [];

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: (cb: (n: any) => void) => {
    mockReceived.push(cb);
    return { remove: jest.fn() };
  },
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
}));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('src/auth/auth-context', () => ({ useAuthContext: () => ({ user: mockUser.current }) }));
jest.mock('src/services/counter-mode', () => ({ useCounterMode: (pick: (s: any) => any) => pick({ device: mockCounter.current }) }));
jest.mock('src/services/store-config', () => ({
  getStoreCode: () => 'shop',
  getWebOrigin: () => 'https://shop.vn',
  isMultiStore: false,
  storeDomain: () => 'shop.vn',
}));
jest.mock('src/api/announcements', () => ({
  getPendingAnnouncements: (...args: unknown[]) => mockGetPending(...args),
  markAnnouncementSeen: (...args: unknown[]) => mockSeen(...args),
  acknowledgeAnnouncement: (...args: unknown[]) => mockAck(...args),
  getAnnouncementImageUrl: (...args: unknown[]) => mockImageUrl(...args),
}));
jest.mock('src/api/axios', () => ({ getStorageUrl: (p: string) => `https://shop.vn/media/${p}` }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 10, left: 0, right: 0 }) }));
jest.mock('src/components/overlay', () => ({ toast: { error: (...args: unknown[]) => mockToastError(...args) } }));
jest.mock('src/features/assistant/links', () => ({
  isHttpUrl: (u: unknown) => typeof u === 'string' && u.startsWith('http'),
  openInAppBrowser: (...args: unknown[]) => mockOpenBrowser(...args),
}));
jest.mock('src/theme/BrandScope', () => ({ BrandScope: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('src/components/ui', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    Text: ({ children, ...p }: any) => <Text {...p}>{children}</Text>,
    GlassView: ({ children }: any) => <View>{children}</View>,
    Icon: () => null,
    cn: (...c: unknown[]) => c.filter(Boolean).join(' '),
    Button: ({ children, onPress, disabled }: any) => (
      <Pressable accessibilityRole="button" onPress={disabled ? undefined : onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

const item = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  title: 'Họp tối nay',
  bodyMarkdown: '**21 giờ** tại quầy',
  severity: 'Info',
  requireAck: false,
  startAt: '2026-11-02T03:00:00Z',
  ctaLabel: null,
  ctaUrl: null,
  ...over,
});

beforeEach(() => {
  mockUser.current = { id: 'u1', roles: ['Staff'] };
  mockCounter.current = null;
  mockGetPending.mockReset().mockResolvedValue([]);
  mockSeen.mockReset().mockResolvedValue(undefined);
  mockAck.mockReset().mockResolvedValue(undefined);
  mockImageUrl.mockReset().mockResolvedValue(null);
  mockPush.mockReset();
  mockOpenBrowser.mockReset();
  mockToastError.mockReset();
  mockReceived.length = 0;
  appStateListeners.length = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t: any, cb: any) => {
    appStateListeners.push(cb);
    return { remove: jest.fn() } as any;
  });
});

describe('phần thuần', () => {
  it('giãn cách', () => {
    expect(shouldCheck(0, 1000)).toBe(true);
    expect(shouldCheck(1000, 1000 + CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(shouldCheck(1000, 1000 + CHECK_INTERVAL_MS)).toBe(true);
  });

  it('hàng đợi không trùng, không thêm lại cái đã xử lý', () => {
    const merged = mergeQueue([item({ id: 'a' })] as any, [item({ id: 'b' }), item({ id: 'a' }), item({ id: 'c' })] as any, new Set(['c']));
    expect(merged.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('nhận ra push thông báo, cả data dạng chuỗi JSON', () => {
    expect(isAnnouncementPush({ type: 'announcement' })).toBe(true);
    expect(isAnnouncementPush(JSON.stringify({ type: 'announcement' }))).toBe(true);
    expect(isAnnouncementPush({ type: 'inspection-fault' })).toBe(false);
  });

  it('nút hành động: màn trong app, không có thì web của cửa hàng, link lạ thì ẩn', () => {
    expect(announcementCta('/dashboard/hr/policies', 'https://shop.vn')).toEqual({ kind: 'app', route: '/hr/policies' });
    expect(announcementCta('/dashboard/hr/rules', 'https://shop.vn')).toEqual({ kind: 'web', url: 'https://shop.vn/dashboard/hr/rules' });
    expect(announcementCta('/dashboard/hr/rules', null)).toBeNull();
    expect(announcementCta('https://evil.example', 'https://shop.vn')).toBeNull();
    expect(announcementCta('//evil.example', 'https://shop.vn')).toBeNull();
    expect(announcementCta('/khac', 'https://shop.vn')).toBeNull();
    expect(announcementCta(null, 'https://shop.vn')).toBeNull();
  });

  it('bỏ thẻ HTML, link chỉ còn chữ', () => {
    expect(announcementBlocks('<b>Đậm</b> <script>alert(1)</script>')).toEqual([{ type: 'paragraph', text: 'Đậm alert(1)' }]);
    expect(plainSpans('Xem [ở đây](https://evil.example) và https://evil.example')).toEqual([
      { text: 'Xem ' },
      { text: 'ở đây' },
      { text: ' và ' },
      { text: 'https://evil.example' },
    ]);
    expect(plainSpans('**đậm**')).toEqual([{ text: 'đậm', bold: true }]);
  });
});

describe('ảnh đính kèm', () => {
  const SIGNED = 'announcements/x/a.png?exp=1&sig=s';
  const RN = jest.requireActual('react-native');
  const images = (view: { UNSAFE_getAllByType: (t: any) => any[] }) => view.UNSAFE_getAllByType(RN.Image);
  const loaded = (image: any, width = 1040, height = 5358) =>
    act(() => image.props.onLoad({ nativeEvent: { source: { width, height } } }));

  it('tỉ lệ và vùng cuộn', () => {
    expect(imageRatio(1040, 5358)).toBeCloseTo(0.194, 3);
    expect(imageRatio(0, 10)).toBeNull();
    expect(imageRatio(undefined, undefined)).toBeNull();
    expect(scrollMaxHeight(800, false)).toBe(400);
    expect(scrollMaxHeight(800, true)).toBe(480);
  });

  it('không có ảnh thì không có thẻ ảnh, vẫn như cũ', async () => {
    mockGetPending.mockResolvedValue([item({ imageUrl: null })]);
    render(<AnnouncementHost />);
    await screen.findByText('Họp tối nay');

    expect(screen.queryByTestId('announcement-image')).toBeNull();
    expect(mockImageUrl).not.toHaveBeenCalled();
  });

  it('ảnh dài: rộng bằng khung, đúng tỉ lệ, nằm trong vùng cuộn cùng nội dung', async () => {
    mockGetPending.mockResolvedValue([item({ imageUrl: SIGNED })]);
    const view = render(<AnnouncementHost />);
    await screen.findByText('Họp tối nay');
    const [image] = images(view);

    expect(image.props.source).toEqual({ uri: `https://shop.vn/media/${SIGNED}` });
    expect(screen.getByLabelText('Ảnh đính kèm: Họp tối nay')).toBeTruthy();
    loaded(image);

    const style = images(view)[0].props.style;
    expect(style.width).toBe('100%');
    expect(style.aspectRatio).toBeCloseTo(1040 / 5358, 5);
    expect(images(view)[0].props.resizeMode).toBe('contain');
  });

  it('chạm để xem toàn màn hình, nút Back chỉ đóng ảnh, popup bắt buộc xác nhận vẫn còn', async () => {
    mockGetPending.mockResolvedValue([item({ requireAck: true, imageUrl: SIGNED })]);
    const view = render(<AnnouncementHost />);
    await screen.findByText('Họp tối nay');
    loaded(images(view)[0]);

    fireEvent.press(screen.getByTestId('announcement-image'));
    expect(screen.getByTestId('announcement-image-zoom')).toBeTruthy();

    act(() => view.UNSAFE_getByType(RN.Modal).props.onRequestClose());
    expect(screen.queryByTestId('announcement-image-zoom')).toBeNull();
    expect(screen.getByText('Họp tối nay')).toBeTruthy();

    fireEvent.press(screen.getByTestId('announcement-image'));
    fireEvent.press(screen.getByLabelText('Đóng ảnh'));
    expect(screen.queryByTestId('announcement-image-zoom')).toBeNull();
  });

  it('link hết hạn: xin link mới một lần rồi hiện lại', async () => {
    mockGetPending.mockResolvedValue([item({ imageUrl: SIGNED })]);
    mockImageUrl.mockResolvedValue('announcements/x/a.png?exp=2&sig=t');
    const view = render(<AnnouncementHost />);
    await screen.findByText('Họp tối nay');

    await act(async () => images(view)[0].props.onError());

    expect(mockImageUrl).toHaveBeenCalledWith('a1');
    expect(images(view)[0].props.source.uri).toBe('https://shop.vn/media/announcements/x/a.png?exp=2&sig=t');
    expect(screen.queryByText('Không tải được ảnh đính kèm.')).toBeNull();
  });

  it('ảnh lỗi hẳn: vẫn đọc được chữ, vẫn bấm được Đã hiểu, thử lại được', async () => {
    mockGetPending.mockResolvedValue([item({ requireAck: true, imageUrl: SIGNED })]);
    mockImageUrl.mockRejectedValue({ status: 500 });
    const view = render(<AnnouncementHost />);
    await screen.findByText('Họp tối nay');

    await act(async () => images(view)[0].props.onError());

    expect(screen.getByText('Không tải được ảnh đính kèm.')).toBeTruthy();
    expect(screen.getByText('21 giờ')).toBeTruthy();

    fireEvent.press(screen.getByText('Thử lại'));
    expect(images(view)).toHaveLength(1);

    fireEvent.press(screen.getByText('Đã hiểu'));
    await waitFor(() => expect(mockAck).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(screen.queryByText('Họp tối nay')).toBeNull());
  });
});

describe('AnnouncementHost', () => {
  it('mở app thì hiện, báo đã thấy một lần, Đã hiểu thì sang cái tiếp theo', async () => {
    mockGetPending.mockResolvedValue([item({ id: 'a', title: 'Thứ nhất', requireAck: true }), item({ id: 'b', title: 'Thứ hai' })]);
    render(<AnnouncementHost />);

    expect(await screen.findByText('Thứ nhất')).toBeTruthy();
    expect(screen.queryByText('Thứ hai')).toBeNull();
    await waitFor(() => expect(mockSeen).toHaveBeenCalledWith('a'));

    fireEvent.press(screen.getByText('Đã hiểu'));

    expect(await screen.findByText('Thứ hai')).toBeTruthy();
    expect(mockAck).toHaveBeenCalledWith('a');
  });

  it('bắt buộc xác nhận: chạm ngoài và nút Back không đóng', async () => {
    mockGetPending.mockResolvedValue([item({ requireAck: true })]);
    const { UNSAFE_getByType } = render(<AnnouncementHost />);
    await screen.findByText('Họp tối nay');

    fireEvent.press(screen.getByTestId('announcement-backdrop'));
    act(() => UNSAFE_getByType(jest.requireActual('react-native').Modal).props.onRequestClose());

    expect(screen.getByText('Họp tối nay')).toBeTruthy();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('không bắt buộc: chạm ngoài đóng được', async () => {
    mockGetPending.mockResolvedValue([item()]);
    render(<AnnouncementHost />);
    await screen.findByText('Họp tối nay');

    fireEvent.press(screen.getByTestId('announcement-backdrop'));

    await waitFor(() => expect(screen.queryByText('Họp tối nay')).toBeNull());
  });

  it('bắt buộc xác nhận mà lỗi mạng: vẫn còn trên màn hình, báo lỗi', async () => {
    mockGetPending.mockResolvedValue([item({ requireAck: true })]);
    mockAck.mockRejectedValue({ status: 500 });
    render(<AnnouncementHost />);

    fireEvent.press(await screen.findByText('Đã hiểu'));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.getByText('Họp tối nay')).toBeTruthy();
  });

  it('thông báo đã bị xoá (404) không kẹt người dùng', async () => {
    mockGetPending.mockResolvedValue([item({ requireAck: true })]);
    mockAck.mockRejectedValue({ status: 404 });
    render(<AnnouncementHost />);

    fireEvent.press(await screen.findByText('Đã hiểu'));

    await waitFor(() => expect(screen.queryByText('Họp tối nay')).toBeNull());
  });

  it('nút hành động: xác nhận rồi mở màn trong app', async () => {
    mockGetPending.mockResolvedValue([item({ ctaLabel: 'Xem nội quy', ctaUrl: '/dashboard/hr/policies' })]);
    render(<AnnouncementHost />);

    fireEvent.press(await screen.findByText('Xem nội quy'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/hr/policies'));
    expect(mockAck).toHaveBeenCalled();
  });

  it('nút hành động với link ngoài bị ẩn', async () => {
    mockGetPending.mockResolvedValue([item({ ctaLabel: 'Bấm', ctaUrl: 'https://evil.example' })]);
    render(<AnnouncementHost />);

    await screen.findByText('Họp tối nay');

    expect(screen.queryByText('Bấm')).toBeNull();
  });

  it('quay lại app trong giãn cách không gọi lại; push thông báo thì gọi ngay', async () => {
    render(<AnnouncementHost />);
    await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

    act(() => appStateListeners.at(-1)!('active'));
    expect(mockGetPending).toHaveBeenCalledTimes(1);

    act(() => mockReceived.at(-1)!({ request: { content: { data: { type: 'announcement' } } } }));
    await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(2));

    act(() => mockReceived.at(-1)!({ request: { content: { data: { type: 'khac' } } } }));
    expect(mockGetPending).toHaveBeenCalledTimes(2);
  });

  it('máy quầy, tài khoản khách, chưa đăng nhập: không gọi API', async () => {
    mockCounter.current = { id: 'device' };
    const counter = render(<AnnouncementHost />);
    counter.unmount();
    mockCounter.current = null;

    mockUser.current = { id: 'u2', roles: ['User'] };
    const customer = render(<AnnouncementHost />);
    customer.unmount();

    mockUser.current = null;
    render(<AnnouncementHost />);

    expect(mockGetPending).not.toHaveBeenCalled();
  });

  it('lỗi tải danh sách không hiện gì, không báo lỗi', async () => {
    mockGetPending.mockRejectedValue({ status: 403 });
    render(<AnnouncementHost />);

    await waitFor(() => expect(mockGetPending).toHaveBeenCalled());
    expect(screen.queryByText('Đã hiểu')).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
