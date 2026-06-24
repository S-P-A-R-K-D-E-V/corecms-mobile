import { useState } from 'react';
import { View, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader } from 'src/components/shared';
import { Text, Button, TextField, Icon, Pressable, Divider, type IconName } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { createAttendanceRequest } from 'src/api/attendance';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';
import type { ICreateAttendanceRequestDto } from 'src/types/corecms-api';

type RequestType = ICreateAttendanceRequestDto['type'];

const TYPES: { value: RequestType; label: string; desc: string; icon: IconName; tone: 'warning' | 'info' | 'secondary' }[] = [
  { value: 'LeaveRequest', label: 'Xin nghỉ phép', desc: 'Nghỉ cả ngày hoặc một phần', icon: 'calendar-remove-outline', tone: 'warning' },
  { value: 'AdjustCheckIn', label: 'Điều chỉnh giờ vào', desc: 'Quên chấm vào / giờ sai', icon: 'clock-in', tone: 'info' },
  { value: 'AdjustCheckOut', label: 'Điều chỉnh giờ ra', desc: 'Quên chấm ra / giờ sai', icon: 'clock-out', tone: 'secondary' },
];

export function NewAttendanceRequestScreen() {
  const [type, setType] = useState<RequestType>('LeaveRequest');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!reason.trim()) e.reason = 'Vui lòng nhập lý do';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !dayjs(date).isValid()) e.date = 'Định dạng ngày không hợp lệ (YYYY-MM-DD)';
    if (type === 'AdjustCheckIn' && !/^\d{2}:\d{2}$/.test(checkInTime)) e.checkInTime = 'Giờ vào không hợp lệ (HH:mm)';
    if (type === 'AdjustCheckOut' && !/^\d{2}:\d{2}$/.test(checkOutTime)) e.checkOutTime = 'Giờ ra không hợp lệ (HH:mm)';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createAttendanceRequest({
        type,
        reason: reason.trim(),
        requestedCheckIn: type === 'AdjustCheckIn' ? dayjs(`${date}T${checkInTime}`).toISOString() : undefined,
        requestedCheckOut: type === 'AdjustCheckOut' ? dayjs(`${date}T${checkOutTime}`).toISOString() : undefined,
      });
      Alert.alert('✅ Gửi thành công', 'Yêu cầu đã được gửi và đang chờ quản lý duyệt.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      Alert.alert(t('common.error'), extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen tabBarInset={false}>
      <AppHeader title="Tạo yêu cầu" back />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <View className="gap-4">
          <View className="gap-2">
            <Text variant="label" tone="muted">Loại yêu cầu</Text>
            {TYPES.map((opt) => {
              const active = type === opt.value;
              return (
                <Pressable key={opt.value} onPress={() => { setType(opt.value); setErrors({}); }} className={cn('flex-row items-center gap-3 p-3 rounded-xl border', active ? 'border-primary border-2 bg-primary-50' : 'border-line')}>
                  <Icon name={opt.icon} size={24} tone={active ? 'primary' : 'muted'} />
                  <View className="flex-1">
                    <Text className={cn('font-semibold', active && 'text-primary')}>{opt.label}</Text>
                    <Text variant="caption" tone="faint">{opt.desc}</Text>
                  </View>
                  {active ? <Icon name="check-circle" size={20} tone="primary" /> : null}
                </Pressable>
              );
            })}
          </View>

          <Divider />

          <TextField label="Ngày áp dụng (YYYY-MM-DD)" value={date} onChangeText={(v) => { setDate(v); setErrors((e) => ({ ...e, date: '' })); }} icon="calendar" keyboardType="numbers-and-punctuation" error={errors.date} placeholder="2026-06-12" />

          {type === 'AdjustCheckIn' ? (
            <TextField label="Giờ vào thực tế (HH:mm)" value={checkInTime} onChangeText={(v) => { setCheckInTime(v); setErrors((e) => ({ ...e, checkInTime: '' })); }} icon="clock-in" keyboardType="numbers-and-punctuation" error={errors.checkInTime} placeholder="08:30" />
          ) : null}
          {type === 'AdjustCheckOut' ? (
            <TextField label="Giờ ra thực tế (HH:mm)" value={checkOutTime} onChangeText={(v) => { setCheckOutTime(v); setErrors((e) => ({ ...e, checkOutTime: '' })); }} icon="clock-out" keyboardType="numbers-and-punctuation" error={errors.checkOutTime} placeholder="17:30" />
          ) : null}

          <TextField
            label="Lý do"
            value={reason}
            onChangeText={(v) => { setReason(v); setErrors((e) => ({ ...e, reason: '' })); }}
            placeholder={type === 'LeaveRequest' ? 'VD: Bận việc gia đình...' : 'VD: Quên bấm chấm công...'}
            multiline
            maxLength={500}
            error={errors.reason}
            className="min-h-[90px]"
            containerClassName="mb-1"
          />

          <Button icon="send" loading={submitting} onPress={handleSubmit}>Gửi yêu cầu</Button>
          <View className="h-6" />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
