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

import { checkIn, checkOut, checkinFace, getMyAttendanceLogs } from 'src/api/attendance';
import { getMyClaims } from 'src/api/shiftPool';
import { extractApiError } from 'src/services/error';
import { FaceCaptureModal } from 'src/features/checkin/FaceCaptureModal';
import { reverseGeocode, type Coords, type GpsStatus } from 'src/features/checkin/utils';
import type { IAttendanceLog, IShiftPoolPost } from 'src/types/corecms-api';

/**
 * Màn check-in/check-out LÀM HỘ GIỮA CA (MidShift): người hộ không có ca của riêng mình
 * trong ngày nên KHÔNG thể dùng luồng smart check-in thường (chỉ tìm ca của chính mình) —
 * màn này gọi endpoint check-in/check-out TƯỜNG MINH với ShiftAssignmentId của NGƯỜI NHỜ,
 * được backend cho phép nhờ claim MidShift đã duyệt. Check-out bắt buộc chụp ảnh
 * (BE chặn nếu thiếu) — ảnh đẩy lên nhóm Telegram chấm công qua luồng checkin-face.
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

  async function openCamera(kind: 'checkin' | 'checkout') {
    if (kind === 'checkout') {
      const ok = await confirm({
        title: 'Kết thúc làm hộ',
        message: 'Chụp ảnh check-out để kết thúc phiên làm hộ? Ảnh sẽ được gửi vào nhóm chấm công.',
        confirmText: 'Chụp ảnh',
      });
      if (!ok) return;
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

  async function pushFacePhoto(base64: string, captureTime: Date) {
    await checkinFace({
      candidateName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Unknown',
      imageBase64: `data:image/jpeg;base64,${base64}`,
      lat: coords?.latitude,
      lng: coords?.longitude,
      time: captureTime.toISOString(),
    });
  }

  async function handleConfirmCapture(base64: string, captureTime: Date) {
    if (!post) return;
    setSubmitting(true);
    try {
      if (actionKind === 'checkin') {
        // Check-in TƯỜNG MINH vào ca của NGƯỜI NHỜ — backend cho phép nhờ claim
        // MidShift đã duyệt (KHÔNG qua smart check-in, nó chỉ tìm ca của chính mình).
        await checkIn({
          shiftAssignmentId: post.shiftAssignmentId,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          accuracy: coords?.accuracy,
          faceVerified: true,
        });
        await pushFacePhoto(base64, captureTime);
        setSuccessMsg('Đã bắt đầu làm hộ!');
      } else {
        if (!openLog) throw new Error('Không tìm thấy phiên làm hộ đang mở.');
        await checkOut({
          attendanceLogId: openLog.id,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          accuracy: coords?.accuracy,
          faceVerified: true,
        });
        await pushFacePhoto(base64, captureTime);
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
            <Button icon="camera-account" loading={submitting} disabled={post.status !== 'Approved'} onPress={() => openCamera('checkin')}>
              Chụp ảnh & bắt đầu làm hộ
            </Button>
          ) : phase === 'checkout' ? (
            <SectionCard title="Đang làm hộ" icon="progress-clock">
              <Text variant="bodySmall" tone="muted" className="mb-3">
                Check-in lúc {openLog?.checkInTime ? dayjs(openLog.checkInTime).format('HH:mm') : '--'}.
                Khi xong việc, chụp ảnh check-out để kết thúc — ảnh sẽ gửi vào nhóm chấm công.
              </Text>
              <Button action="error" icon="logout" loading={submitting} onPress={() => openCamera('checkout')}>
                Chụp ảnh & kết thúc làm hộ
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

      <SuccessOverlay visible={!!successMsg} message={successMsg ?? undefined} onDone={() => setSuccessMsg(null)} />
    </View>
  );
}
