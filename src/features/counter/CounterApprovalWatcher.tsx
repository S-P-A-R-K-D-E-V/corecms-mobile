import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, View } from 'react-native';

import { Button, Icon, Text } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { approveCounterLogin, getMyCounterApprovals, rejectCounterLogin, type CounterApproval } from 'src/api/counter';
import { useCounterMode } from 'src/services/counter-mode';
import { extractApiError } from 'src/services/error';
import { useT } from 'src/i18n';

// ----------------------------------------------------------------------
// Điện thoại của nhân viên (không phải máy quầy): ai đó bấm tên mình trên máy quầy → mở app (hoặc app đang mở) là thấy
// ngay mã 6 số to + nút Đồng ý — không phụ thuộc thông báo đẩy (Android chưa cấu hình push). Đồng ý = máy quầy tự vào;
// "Không phải tôi" = máy quầy báo bị từ chối. Hỏi server lúc mở app, khi quay lại app và vài giây một lần khi đang mở.
// ----------------------------------------------------------------------

const POLL_MS = 4000;

export function CounterApprovalWatcher() {
  const { authenticated } = useAuthContext();
  const counter = useCounterMode((s) => s.device);
  const active = authenticated && !counter;

  const [request, setRequest] = useState<CounterApproval | null>(null);
  const dismissed = useRef<Set<string>>(new Set());
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const list = await getMyCounterApprovals();
      const next = list.find((r) => !dismissed.current.has(r.requestId)) ?? null;
      setRequest((current) => (current && list.some((r) => r.requestId === current.requestId) ? current : next));
    } catch {
      // Mất mạng / server cũ chưa có API — thử lại lần sau, không làm phiền người dùng.
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) {
      setRequest(null);
      return undefined;
    }
    void check();
    let timer: ReturnType<typeof setInterval> | null = setInterval(check, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void check();
        if (!timer) timer = setInterval(check, POLL_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [active, check]);

  if (!active || !request) return null;

  return (
    <ApprovalSheet
      request={request}
      onDone={(id) => {
        dismissed.current.add(id);
        setRequest(null);
      }}
    />
  );
}

function ApprovalSheet({ request, onDone }: { request: CounterApproval; onDone: (requestId: string) => void }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  const [working, setWorking] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, Math.ceil((new Date(request.expiresAt).getTime() - now) / 1000));
  useEffect(() => {
    if (left === 0) onDone(request.requestId);
  }, [left, onDone, request.requestId]);

  const place = [request.deviceName, request.branchName].filter(Boolean).join(' · ');

  async function decide(approve: boolean) {
    setWorking(approve ? 'approve' : 'reject');
    try {
      if (approve) {
        await approveCounterLogin(request.requestId);
        toast.success(t('counter.approve.approved', { place }));
      } else {
        await rejectCounterLogin(request.requestId);
        toast.info(t('counter.approve.rejected'));
      }
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setWorking(null);
      onDone(request.requestId);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onDone(request.requestId)}>
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View className="w-full rounded-3xl bg-surface dark:bg-surface-dark p-6 items-center gap-3" style={{ maxWidth: 420 }}>
          <Icon name="cash-register" size={40} tone="primary" />
          <Text variant="headline" className="text-center">{t('counter.approve.title')}</Text>
          {place ? <Text tone="muted" className="text-center">{place}</Text> : null}
          <Text style={{ fontSize: 52, lineHeight: 60, letterSpacing: 8, fontWeight: '700' }}>
            {request.code.slice(0, 3)} {request.code.slice(3)}
          </Text>
          <Text variant="caption" tone="muted" className="text-center">
            {t('counter.approve.hint', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` })}
          </Text>
          <View className="w-full gap-2 mt-2">
            <Button icon="check" loading={working === 'approve'} disabled={!!working} onPress={() => void decide(true)}>
              {t('counter.approve.approve')}
            </Button>
            <Button variant="outline" action="neutral" loading={working === 'reject'} disabled={!!working} onPress={() => void decide(false)}>
              {t('counter.approve.reject')}
            </Button>
            <Button variant="ghost" action="neutral" disabled={!!working} onPress={() => onDone(request.requestId)}>
              {t('common.close')}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
