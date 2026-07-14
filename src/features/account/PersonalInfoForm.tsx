import { useCallback, useEffect, useState } from 'react';
import { View, Image, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Loading, BankPickerSheet, IdCardCameraModal } from 'src/components/shared';
import { Text, Button, TextField, Icon, Pressable, Divider, Avatar } from 'src/components/ui';
import { toast, showActionSheet } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { getStorageUrl } from 'src/api/axios';
import { getMe, updateMyProfile, uploadMyAvatar, uploadMyIdCard, type RNFile } from 'src/api/users';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';
import type { IUser, IVietQRBank } from 'src/types/corecms-api';

function assetToFile(asset: ImagePicker.ImagePickerAsset, fallback: string): RNFile {
  const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  return { uri: asset.uri, name: asset.fileName ?? `${fallback}.${ext}`, type: asset.mimeType ?? (ext === 'png' ? 'image/png' : 'image/jpeg') };
}

function uriToFile(uri: string, fallback: string): RNFile {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  return { uri, name: `${fallback}.${ext}`, type: ext === 'png' ? 'image/png' : 'image/jpeg' };
}

async function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    toast.error('Vui lòng cấp quyền truy cập thư viện ảnh.', 'Cần quyền truy cập');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
  return result.canceled ? null : result.assets[0];
}

function IdCardSlot({ label, uri, uploading, onPick }: { label: string; uri?: string; uploading: boolean; onPick: () => void }) {
  return (
    <Pressable onPress={onPick} disabled={uploading} className="flex-1 rounded-xl border border-line dark:border-line-dark overflow-hidden" style={{ aspectRatio: 1.586 }}>
      {uri ? <Image source={{ uri }} className="w-full h-full" resizeMode="cover" /> : (
        <View className="flex-1 items-center justify-center"><Icon name="card-account-details-outline" size={32} tone="faint" /></View>
      )}
      <View className="absolute bottom-0 left-0 right-0 flex-row items-center justify-center py-1.5 bg-black/55">
        {uploading ? <ActivityIndicator color="#fff" size="small" /> : (
          <><Icon name="camera-outline" size={16} color="#FFFFFF" /><Text className="text-white text-xs ml-1">{label}</Text></>
        )}
      </View>
    </Pressable>
  );
}

type Props = {
  /** 'edit': màn Chỉnh sửa hồ sơ hiện có — cho lưu khi thiếu field, có avatar+tên.
   *  'onboarding': màn bắt buộc bổ sung hồ sơ khi đăng nhập — ẩn avatar/tên (đã
   *  bắt buộc từ đăng ký), bắt đủ SĐT/địa chỉ/ngân hàng/CCCD mới bật nút lưu. */
  variant: 'edit' | 'onboarding';
  onDone: () => void;
};

export function PersonalInfoForm({ variant, onDone }: Props) {
  const { refreshUser } = useAuthContext();
  const [profile, setProfile] = useState<IUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankLabel, setBankLabel] = useState('');
  const [bankNo, setBankNo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [cameraSide, setCameraSide] = useState<'front' | 'back' | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const me = await getMe();
      setProfile(me);
      setFirstName(me.firstName ?? '');
      setLastName(me.lastName ?? '');
      setPhoneNumber(me.phoneNumber ?? '');
      setAddress(me.address ?? '');
      setBankCode(me.bankCode ?? '');
      setBankNo(me.bankNo ?? '');
    } catch {
      toast.error('Không thể tải thông tin cá nhân.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function handlePickAvatar() {
    const asset = await pickImage();
    if (!asset) return;
    setUploadingAvatar(true);
    try {
      await uploadMyAvatar(assetToFile(asset, 'avatar'));
      await loadProfile();
      await refreshUser();
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function uploadIdCardFile(side: 'front' | 'back', file: RNFile) {
    const setUploading = side === 'front' ? setUploadingFront : setUploadingBack;
    setUploading(true);
    try {
      await uploadMyIdCard(side === 'front' ? file : undefined, side === 'back' ? file : undefined);
      await loadProfile();
      setErrors((p) => ({ ...p, [side === 'front' ? 'idCardFront' : 'idCardBack']: '' }));
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setUploading(false);
    }
  }

  async function handlePickIdCard(side: 'front' | 'back') {
    await showActionSheet({
      title: side === 'front' ? 'Ảnh CCCD mặt trước' : 'Ảnh CCCD mặt sau',
      options: [
        { label: 'Chụp ảnh', icon: 'camera-outline', onPress: () => setCameraSide(side) },
        {
          label: 'Chọn từ thư viện ảnh',
          icon: 'image-outline',
          onPress: async () => {
            const asset = await pickImage();
            if (!asset) return;
            await uploadIdCardFile(side, assetToFile(asset, `id-card-${side}`));
          },
        },
      ],
    });
  }

  function handleCameraConfirm(uri: string) {
    const side = cameraSide;
    setCameraSide(null);
    if (!side) return;
    void uploadIdCardFile(side, uriToFile(uri, `id-card-${side}`));
  }

  function handleSelectBank(bank: IVietQRBank) {
    setBankCode(bank.code);
    setBankLabel(`${bank.shortName} — ${bank.name}`);
    setErrors((p) => ({ ...p, bankCode: '' }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (variant === 'edit') {
      if (!firstName.trim()) e.firstName = 'Vui lòng nhập họ';
      if (!lastName.trim()) e.lastName = 'Vui lòng nhập tên';
    }
    if (phoneNumber.trim() && !/^[0-9+\s]{8,15}$/.test(phoneNumber.trim())) e.phoneNumber = 'Số điện thoại không hợp lệ';
    if (variant === 'onboarding') {
      if (!phoneNumber.trim()) e.phoneNumber = e.phoneNumber || 'Vui lòng nhập số điện thoại';
      if (!address.trim()) e.address = 'Vui lòng nhập địa chỉ';
      if (!bankCode.trim()) e.bankCode = 'Vui lòng chọn ngân hàng';
      if (!bankNo.trim()) e.bankNo = 'Vui lòng nhập số tài khoản';
      if (!profile?.idCardFrontUrl) e.idCardFront = 'Vui lòng bổ sung ảnh CCCD mặt trước';
      if (!profile?.idCardBackUrl) e.idCardBack = 'Vui lòng bổ sung ảnh CCCD mặt sau';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        address: address.trim() || undefined,
        bankCode: bankCode.trim() || undefined,
        bankNo: bankNo.trim() || undefined,
      });
      await refreshUser();
      toast.success('Thông tin cá nhân đã được cập nhật.', 'Đã lưu');
      onDone();
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Loading />;

  const avatarUrl = profile?.profileImageUrl ? getStorageUrl(profile.profileImageUrl) : undefined;
  const idCardFrontUrl = profile?.idCardFrontUrl ? getStorageUrl(profile.idCardFrontUrl) : undefined;
  const idCardBackUrl = profile?.idCardBackUrl ? getStorageUrl(profile.idCardBackUrl) : undefined;
  const isOnboarding = variant === 'onboarding';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <View className="gap-4">
        {!isOnboarding && (
          <>
            {/* Avatar */}
            <View className="items-center rounded-3xl bg-surface dark:bg-surface-dark p-6 border border-line/60 dark:border-line-dark">
              <Pressable onPress={handlePickAvatar} disabled={uploadingAvatar} className="relative">
                <Avatar name={`${firstName} ${lastName}`} uri={avatarUrl} size={96} />
                <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary items-center justify-center border-2 border-surface dark:border-surface-dark">
                  {uploadingAvatar ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="camera" size={16} color="#FFFFFF" />}
                </View>
              </Pressable>
              <Text variant="caption" tone="faint" className="mt-2.5">Chạm để thay ảnh đại diện</Text>
            </View>

            {/* Basic */}
            <Text variant="label" tone="muted">Thông tin cơ bản</Text>
            <View className="flex-row gap-2.5">
              <View className="flex-1"><TextField label="Họ" value={firstName} onChangeText={(v) => { setFirstName(v); setErrors((p) => ({ ...p, firstName: '' })); }} error={errors.firstName} /></View>
              <View className="flex-1"><TextField label="Tên" value={lastName} onChangeText={(v) => { setLastName(v); setErrors((p) => ({ ...p, lastName: '' })); }} error={errors.lastName} /></View>
            </View>
            <TextField label="Email" value={profile?.email ?? ''} editable={false} icon="email-outline" />
          </>
        )}

        <TextField label="Số điện thoại" value={phoneNumber} onChangeText={(v) => { setPhoneNumber(v); setErrors((p) => ({ ...p, phoneNumber: '' })); }} keyboardType="phone-pad" icon="phone-outline" error={errors.phoneNumber} />
        <TextField label="Địa chỉ" value={address} onChangeText={(v) => { setAddress(v); setErrors((p) => ({ ...p, address: '' })); }} icon="map-marker-outline" error={errors.address} />

        <Divider />

        {/* Bank */}
        <Text variant="label" tone="muted">Tài khoản ngân hàng (nhận lương)</Text>
        <Pressable onPress={() => setBankPickerOpen(true)}>
          <View pointerEvents="none">
            <TextField
              label="Ngân hàng"
              value={bankLabel || bankCode}
              placeholder="Chạm để chọn ngân hàng"
              editable={false}
              icon="bank-outline"
              error={errors.bankCode}
            />
          </View>
        </Pressable>
        <TextField label="Số tài khoản" value={bankNo} onChangeText={(v) => { setBankNo(v); setErrors((p) => ({ ...p, bankNo: '' })); }} keyboardType="number-pad" icon="credit-card-outline" error={errors.bankNo} />

        <Divider />

        {/* ID card */}
        <Text variant="label" tone="muted">Căn cước công dân (CCCD)</Text>
        <Text variant="caption" tone="faint">Chạm vào từng ô để chụp ảnh hoặc chọn từ thư viện</Text>
        <View className="flex-row gap-3">
          <IdCardSlot label="Mặt trước" uri={idCardFrontUrl} uploading={uploadingFront} onPick={() => handlePickIdCard('front')} />
          <IdCardSlot label="Mặt sau" uri={idCardBackUrl} uploading={uploadingBack} onPick={() => handlePickIdCard('back')} />
        </View>
        {errors.idCardFront ? <Text variant="caption" tone="error">{errors.idCardFront}</Text> : null}
        {errors.idCardBack ? <Text variant="caption" tone="error">{errors.idCardBack}</Text> : null}

        <Button icon="content-save-outline" loading={submitting} onPress={handleSubmit} className="mt-2">
          {isOnboarding ? 'Hoàn tất' : t('common.save')}
        </Button>
        <View className="h-8" />
      </View>

      <BankPickerSheet visible={bankPickerOpen} onClose={() => setBankPickerOpen(false)} onSelect={handleSelectBank} />
      <IdCardCameraModal
        visible={cameraSide !== null}
        title={cameraSide === 'front' ? 'Chụp CCCD mặt trước' : 'Chụp CCCD mặt sau'}
        onClose={() => setCameraSide(null)}
        onConfirm={handleCameraConfirm}
      />
    </KeyboardAvoidingView>
  );
}
