import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import * as Crypto from 'expo-crypto';

import { Button, Spinner, Text } from 'src/components/ui';
import { counterQrStatus, exchangeCounterQr, startCounterQr, type CounterError } from 'src/api/counter';
import type { IAuthResponse } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Dự phòng trên máy quầy: hiện mã QR, nhân viên mở app trên điện thoại → Hồ sơ → Đăng nhập web bằng QR → quét và
// duyệt. Máy quầy hỏi trạng thái mỗi vài giây; duyệt xong thì đổi mã + verifier (chỉ máy này giữ) lấy phiên — gửi
// kèm key máy quầy nên phiên gắn với máy và hết khi hết ca như đăng nhập bằng mã 6 số.

const MAX_RENEWALS = 4;

function toHex(bytes: Uint8Array): string {
  let out = '';
  bytes.forEach((b) => {
    out += b.toString(16).padStart(2, '0');
  });
  return out;
}

type Phase = 'loading' | 'showing' | 'scanned' | 'signing-in' | 'error';

export function CounterQrPanel({ onSignedIn, onCancel }: { onSignedIn: (auth: IAuthResponse) => Promise<void>; onCancel: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const session = useRef<{ code: string; verifier: string; poll: number } | null>(null);
  const renewals = useRef(0);
  const alive = useRef(true);

  const start = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const verifier = toHex(Crypto.getRandomBytes(32));
      const challenge = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier)).toLowerCase();
      const res = await startCounterQr(challenge);
      if (!alive.current) return;
      session.current = { code: res.code, verifier, poll: Math.max(2, res.pollIntervalSeconds) };
      setImage(res.qrImage ?? null);
      setExpiresAt(Date.now() + res.expiresInSeconds * 1000);
      setPhase(res.qrImage ? 'showing' : 'error');
      if (!res.qrImage) setError('Máy chủ chưa hỗ trợ QR cho máy quầy.');
    } catch (err) {
      if (!alive.current) return;
      setError((err as CounterError).message ?? 'Không tạo được mã QR.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void start();
    return () => {
      alive.current = false;
    };
  }, [start]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Hỏi trạng thái theo nhịp server đề nghị.
  useEffect(() => {
    if (phase !== 'showing' && phase !== 'scanned') return undefined;
    const current = session.current;
    if (!current) return undefined;
    const id = setInterval(async () => {
      try {
        const status = await counterQrStatus(current.code);
        if (!alive.current || session.current !== current) return;
        if (status === 'scanned') setPhase('scanned');
        else if (status === 'rejected') {
          setError('Đã từ chối trên điện thoại.');
          setPhase('error');
        } else if (status === 'expired') {
          if (renewals.current < MAX_RENEWALS) {
            renewals.current += 1;
            void start();
          } else {
            setError('Mã QR đã hết hạn.');
            setPhase('error');
          }
        } else if (status === 'approved') {
          setPhase('signing-in');
          const auth = await exchangeCounterQr(current.code, current.verifier);
          await onSignedIn(auth);
        }
      } catch (err) {
        if (!alive.current) return;
        setError((err as CounterError).message ?? 'Không đăng nhập được.');
        setPhase('error');
      }
    }, current.poll * 1000);
    return () => clearInterval(id);
  }, [phase, start, onSignedIn]);

  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  return (
    <View className="items-center gap-3 py-4">
      <Text variant="headline" className="text-center">Quét bằng app trên điện thoại</Text>
      <Text tone="muted" className="text-center" style={{ maxWidth: 420 }}>
        Mở app → Hồ sơ → Đăng nhập web bằng mã QR, quét mã dưới đây rồi bấm Đồng ý.
      </Text>
      <View className="items-center justify-center rounded-2xl bg-white p-3" style={{ width: 280, height: 280 }}>
        {phase === 'loading' || !image ? (
          <Spinner />
        ) : (
          <Image source={{ uri: image }} style={{ width: 254, height: 254, opacity: phase === 'showing' ? 1 : 0.25 }} resizeMode="contain" />
        )}
      </View>
      {phase === 'scanned' ? <Text tone="primary">Đã quét — chờ bấm Đồng ý trên điện thoại…</Text> : null}
      {phase === 'signing-in' ? <Spinner /> : null}
      {phase === 'showing' ? (
        <Text tone="muted" variant="caption">Mã tự đổi sau {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Text>
      ) : null}
      {phase === 'error' && error ? <Text tone="error" className="text-center">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button variant="outline" action="neutral" onPress={onCancel}>Quay lại</Button>
        {phase === 'error' ? (
          <Button
            variant="soft"
            onPress={() => {
              renewals.current = 0;
              void start();
            }}
          >
            Tạo mã mới
          </Button>
        ) : null}
      </View>
    </View>
  );
}
