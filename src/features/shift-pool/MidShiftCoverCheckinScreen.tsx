import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import dayjs from 'dayjs';

import { AppHeader, SectionCard, Loading } from 'src/components/shared';
import { Text, Button, Badge, Card, Icon, Divider, SuccessOverlay } from 'src/components/ui';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';

import { useQuery } from '@tanstack/react-query';

import { checkIn, checkInFace, checkOut, checkOutFace, checkinFace, getAttendanceSettings, getMyAttendanceLogs } from 'src/api/attendance';
import { getMyClaims } from 'src/api/shiftPool';
import { extractApiError } from 'src/services/error';
import { FaceCaptureModal } from 'src/features/checkin/FaceCaptureModal';
import { FaceCheckinModal, type FaceSubmit } from 'src/features/checkin/FaceCheckinModal';
import { locateForAttendance } from 'src/features/checkin/fresh-location';
import { locationFields, sendWithFreshLocation, type LocationFix } from 'src/features/checkin/location';
import { reverseGeocode, type Coords, type GpsStatus } from 'src/features/checkin/utils';
import type { IAttendanceLog, IShiftPoolPost } from 'src/types/corecms-api';

/**
 * Màn check-in/check-out LÀM HỘ GIỮA CA (MidShift): người hộ không có ca của riêng mình
 * trong ngày nên KHÔNG thể dùng luồng smart check-in thường (chỉ tìm ca của chính mình) —
 * màn này gọi endpoint check-in/check-out TƯỜNG MINH với ShiftAssignmentId của NGƯỜI NHỜ,
 * được backend cho phép nhờ claim MidShift đã duyệt. Check-out bắt buộc chụp ảnh
 * (BE chặn nếu thiếu) — ảnh đẩy lên nhóm Telegram chấm công qua luồng checkin-face.
 * Theo luồng chấm công của cửa hàng (mỗi lúc một luồng): chế độ khuôn mặt thì quét mặt (check-in-face /
 * check-out-face), không thì chụp ảnh gửi nhóm. Vị trí lấy mới ngay lúc gửi (ping máy chủ trước).
 */
export function MidShiftCoverCheckinScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { user } = useAuthContext();

  const [post, setPost] = useState<IShiftPoolPost | null>(null);
  const [openLog, setOpenLog] = useState<IAttendanceLog | null>(null);
  const [doneLog, setDoneLog] = useState<IAttendanceLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // GPS + camera (mirror CheckinScreen's flow, simplified — no geofence fallback
  // state machine; BE validates geofence server-side either way)
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [modalOpen, setModalOpen] = useState(false);
  const [actionKind, setActionKind] = useState<'checkin' | 'checkout'>('checkin');
  /** Màn quét khuôn mặt (chế độ khuôn mặt của cửa hàng): null = đóng. */
  const [faceKind, setFaceKind] = useState<'checkin' | 'checkout' | null>(null);
  const settingsQ = useQuery({ queryKey: ['attendance-settings'], queryFn: getAttendanceSettings, staleTime: 30 * 1000 });
  const faceMode = !!settingsQ.data?.requireFaceVerification;

  const refetch = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const claims = await getMyClaims();
      const target = claims.find((c) => c.id === postId) ?? null;
      setPost(target);

      if (target) {
        // Xác định trạng thái phiên làm hộ từ SERVER (không dựa local storage — sống sót
        // qua restart app): log của CHÍNH MÌNH gắn vào assignment của người nhờ.
        const today = dayjs().format('YYYY-MM-DD');
        const logs = await getMyAttendanceLogs(today, today);
        const mine = logs.filter((l) => l.shiftAssignmentId === target.shiftAssignmentId);
        setOpenLog(mine.find((l) => l.checkInTime && !l.checkOutTime) ?? null);
        setDoneLog(mine.find((l) => l.checkInTime && l.checkOutTime) ?? null);
      }
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  async function fetchGps(): Promise<void> {
    setGpsStatus('loading');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setGpsStatus('error'); return; }
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        setCoords({ latitude: last.coords.latitude, longitude: last.coords.longitude, accuracy: last.coords.accuracy ?? undefined });
        setGpsStatus('ready');
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined });
      setGpsStatus('ready');
    } catch {
      setGpsStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
    }
  }

  useEffect(() => { fetchGps(); }, []);

  useEffect(() => {
    if (!coords) { setAddress(null); return; }
    let cancelled = false;
    reverseGeocode(coords).then((a) => { if (!cancelled) setAddress(a); });
    return () => { cancelled = true; };
  }, [coords?.latitude, coords?.longitude]);

  /** Vị trí cho lần gửi: ping máy chủ rồi lấy điểm GPS mới (thử lại ~5 giây); cập nhật vị trí trên màn. */
  async function locate(): Promise<LocationFix> {
    const fix = await locateForAttendance();
    if (fix.coords) {
      setCoords(fix.coords);
      setGpsStatus('ready');
    } else {
      setGpsStatus('error');
    }
    return fix;
  }

  async function openCamera(kind: 'checkin' | 'checkout') {
    const mode = settingsQ.data ?? (await settingsQ.refetch()).data;
    if (!mode) {
      toast.error('Không tải được thiết lập chấm công của cửa hàng. Vui lòng thử lại.');
      return;
    }
    if (mode.requireFaceVerification && !user?.hasFaceEmbedding) {
      router.push('/face-enrollment' as any);
      return;
    }
    if (kind === 'checkout') {
      const ok = await confirm({
        title: 'Kết thúc làm hộ',
        message: mode.requireFaceVerification
          ? 'Quét khuôn mặt check-out để kết thúc phiên làm hộ?'
          : 'Chụp ảnh check-out để kết thúc phiên làm hộ? Ảnh sẽ được gửi vào nhóm chấm công.',
        confirmText: mode.requireFaceVerification ? 'Quét khuôn mặt' : 'Chụp ảnh',
      });
      if (!ok) return;
    }
    if (mode.requireFaceVerification) {
      haptics.light();
      setFaceKind(kind);
      return;
    }
    let granted = cameraPermission?.granted;
    if (!granted) granted = (await requestCameraPermission()).granted;
    if (!granted) {
      toast.error('Cần quyền camera để chụp ảnh chấm công.');
      return;
    }
    haptics.light();
    setActionKind(kind);
    setModalOpen(true);
    if (gpsStatus !== 'ready' && gpsStatus !== 'loading') fetchGps();
  }

  async function pushFacePhoto(base64: string, captureTime: Date, fix: LocationFix) {
    await checkinFace({
      candidateName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Unknown',
      imageBase64: `data:image/jpeg;base64,${base64}`,
      lat: fix.coords?.latitude,
      lng: fix.coords?.longitude,
      time: captureTime.toISOString(),
    });
  }

  /** Chế độ khuôn mặt: check-in / check-out đúng ca người nhờ, máy chủ so khuôn mặt. */
  const faceSubmit: FaceSubmit = async (payload) => {
    if (!post) throw new Error('Không tìm thấy yêu cầu làm hộ.');
    if (faceKind === 'checkout') {
      if (!openLog) throw new Error('Không tìm thấy phiên làm hộ đang mở.');
      return (await checkOutFace({ ...payload, attendanceLogId: openLog.id })).faceMatchConfidence;
    }
    return (await checkInFace({ ...payload, shiftAssignmentId: post.shiftAssignmentId })).faceMatchConfidence;
  };

  async function handleConfirmCapture(base64: string, captureTime: Date) {
    if (!post) return;
    setSubmitting(true);
    try {
      if (actionKind === 'checkin') {
        // Check-in TƯỜNG MINH vào ca của NGƯỜI NHỜ — backend cho phép nhờ claim
        // MidShift đã duyệt (KHÔNG qua smart check-in, nó chỉ tìm ca của chính mình).
        const { fix } = await sendWithFreshLocation(locate, (f) =>
          checkIn({ shiftAssignmentId: post.shiftAssignmentId, faceVerified: true, ...locationFields(f) }),
        );
        await pushFacePhoto(base64, captureTime, fix);
        setSuccessMsg('Đã bắt đầu làm hộ!');
      } else {
        if (!openLog) throw new Error('Không tìm thấy phiên làm hộ đang mở.');
        const logId = openLog.id;
        const { fix } = await sendWithFreshLocation(locate, (f) =>
          checkOut({ attendanceLogId: logId, faceVerified: true, ...locationFields(f) }),
        );
        await pushFacePhoto(base64, captureTime, fix);
        setSuccessMsg('Đã kết thúc làm hộ!');
      }
      setModalOpen(false);
      await refetch();
    } catch (err: any) {
      haptics.error();
      toast.error(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const phase: 'checkin' | 'checkout' | 'done' = openLog ? 'checkout' : doneLog ? 'done' : 'checkin';

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <AppHeader title="Làm hộ giữa ca" onBack={() => router.back()} />
      {loading ? (
        <Loading />
      ) : !post ? (
        <View className="px-4 pt-8 items-center gap-2">
          <Icon name="alert-circle-outline" size={40} tone="muted" />
          <Text tone="muted" className="text-center">
            Không tìm thấy yêu cầu làm hộ. Có thể yêu cầu đã bị huỷ hoặc chưa được duyệt.
          </Text>
        </View>
      ) : (
        <View className="px-4 pt-3 gap-3">
          <Card className="p-4 gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text variant="subtitle">{post.shiftName}</Text>
              <Badge tone={post.status === 'Approved' ? 'success' : 'warning'}>
                {post.status === 'Approved' ? 'Đã duyệt' : 'Chờ duyệt'}
              </Badge>
            </View>
            <Text variant="bodySmall" tone="muted">
              {dayjs(post.shiftDate).format('DD/MM/YYYY')} · {post.shiftStartTime} – {post.shiftEndTime}
            </Text>
            <Text variant="bodySmall" tone="muted">Làm hộ cho: {post.posterName}</Text>
            {post.estimatedStartTime && post.estimatedEndTime ? (
              <Text variant="bodySmall" tone="muted">
                Dự kiến: {post.estimatedStartTime.slice(0, 5)} – {post.estimatedEndTime.slice(0, 5)}
              </Text>
            ) : null}
            <Divider className="my-1" />
            <Text variant="caption" tone="faint">
              Bạn check-in/out trực tiếp trên ca của {post.posterName} trong lúc họ vắng mặt.
              Phụ cấp = khoảng giao giữa thời gian vắng của họ và giờ chấm công thực tế của bạn.
            </Text>
          </Card>

          {phase === 'checkin' ? (
            <Button
              icon={faceMode ? 'face-recognition' : 'camera-account'}
              loading={submitting}
              disabled={post.status !== 'Approved'}
              onPress={() => openCamera('checkin')}
            >
              {faceMode ? 'Quét khuôn mặt & bắt đầu làm hộ' : 'Chụp ảnh & bắt đầu làm hộ'}
            </Button>
          ) : phase === 'checkout' ? (
            <SectionCard title="Đang làm hộ" icon="progress-clock">
              <Text variant="bodySmall" tone="muted" className="mb-3">
                Check-in lúc {openLog?.checkInTime ? dayjs(openLog.checkInTime).format('HH:mm') : '--'}.
                {faceMode
                  ? 'Khi xong việc, quét khuôn mặt check-out để kết thúc.'
                  : 'Khi xong việc, chụp ảnh check-out để kết thúc — ảnh sẽ gửi vào nhóm chấm công.'}
              </Text>
              <Button
                action="error"
                icon={faceMode ? 'face-recognition' : 'logout'}
                loading={submitting}
                onPress={() => openCamera('checkout')}
              >
                {faceMode ? 'Quét khuôn mặt & kết thúc làm hộ' : 'Chụp ảnh & kết thúc làm hộ'}
              </Button>
            </SectionCard>
          ) : (
            <SectionCard title="Đã hoàn thành" icon="check-decagram">
              <Text variant="bodySmall" tone="muted">
                Phiên làm hộ: {doneLog?.checkInTime ? dayjs(doneLog.checkInTime).format('HH:mm') : '--'} –{' '}
                {doneLog?.checkOutTime ? dayjs(doneLog.checkOutTime).format('HH:mm') : '--'}. Phụ cấp sẽ được
                tính vào kỳ lương dựa trên chấm công thực tế.
              </Text>
            </SectionCard>
          )}

          {post.status !== 'Approved' ? (
            <Text variant="caption" tone="warning" className="text-center">
              Yêu cầu chưa được duyệt — bạn chỉ có thể check-in sau khi Admin/Manager duyệt.
            </Text>
          ) : null}
        </View>
      )}

      <FaceCaptureModal
        visible={modalOpen}
        coords={coords}
        address={address}
        gpsStatus={gpsStatus}
        canSubmit={actionKind === 'checkout' ? true : gpsStatus === 'ready' || gpsStatus === 'error'}
        loading={submitting}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirmCapture}
        title={actionKind === 'checkout' ? 'Chụp ảnh check-out' : 'Chụp ảnh bắt đầu làm hộ'}
        confirmLabel={actionKind === 'checkout' ? 'Kết thúc làm hộ' : 'Bắt đầu làm hộ'}
      />

      <FaceCheckinModal
        visible={faceKind !== null}
        mode={faceKind ?? 'checkin'}
        locate={locate}
        submit={faceSubmit}
        onClose={() => setFaceKind(null)}
        onSuccess={() => {
          setSuccessMsg(faceKind === 'checkout' ? 'Đã kết thúc làm hộ!' : 'Đã bắt đầu làm hộ!');
          refetch();
        }}
      />

      <SuccessOverlay visible={!!successMsg} message={successMsg ?? undefined} onDone={() => setSuccessMsg(null)} />
    </View>
  );
}
