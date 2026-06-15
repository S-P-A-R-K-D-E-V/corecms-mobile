import { useCallback, useEffect, useState } from 'react';
import { View, Image, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { Screen, AppHeader, Loading } from 'src/components/shared';
import { Text, Button, TextField, Icon, Pressable, Divider } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { getStorageUrl } from 'src/api/axios';
import { getMe, updateMyProfile, uploadMyAvatar, uploadMyIdCard, type RNFile } from 'src/api/users';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';
import type { IUser } from 'src/types/corecms-api';

function assetToFile(asset: ImagePicker.ImagePickerAsset, fallback: string): RNFile {
  const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  return { uri: asset.uri, name: asset.fileName ?? `${fallback}.${ext}`, type: asset.mimeType ?? (ext === 'png' ? 'image/png' : 'image/jpeg') };
}

async function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh.');
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

export function EditProfileScreen() {
  const { refreshUser } = useAuthContext();
  const [profile, setProfile] = useState<IUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankNo, setBankNo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      Alert.alert(t('common.error'), 'Không thể tải thông tin cá nhân.');
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
      Alert.alert(t('common.error'), extractApiError(err));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handlePickIdCard(side: 'front' | 'back') {
    const asset = await pickImage();
    if (!asset) return;
    const setUploading = side === 'front' ? setUploadingFront : setUploadingBack;
    setUploading(true);
    try {
      const file = assetToFile(asset, `id-card-${side}`);
      await uploadMyIdCard(side === 'front' ? file : undefined, side === 'back' ? file : undefined);
      await loadProfile();
    } catch (err: any) {
      Alert.alert(t('common.error'), extractApiError(err));
    } finally {
      setUploading(false);
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = 'Vui lòng nhập họ';
    if (!lastName.trim()) e.lastName = 'Vui lòng nhập tên';
    if (phoneNumber.trim() && !/^[0-9+\s]{8,15}$/.test(phoneNumber.trim())) e.phoneNumber = 'Số điện thoại không hợp lệ';
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
      Alert.alert('✅ Đã lưu', 'Thông tin cá nhân đã được cập nhật.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      Alert.alert(t('common.error'), extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Screen><AppHeader title={t('profile.editProfile')} back /><Loading /></Screen>;
  }

  const avatarUrl = profile?.profileImageUrl ? getStorageUrl(profile.profileImageUrl) : undefined;
  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '??';

  return (
    <Screen scroll>
      <AppHeader title={t('profile.editProfile')} back />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <View className="gap-4">
          {/* Avatar */}
          <View className="items-center rounded-3xl bg-surface dark:bg-surface-dark p-6 border border-line/60 dark:border-line-dark">
            <Pressable onPress={handlePickAvatar} disabled={uploadingAvatar} className="relative">
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} className="w-24 h-24 rounded-full" />
              ) : (
                <View className="w-24 h-24 rounded-full bg-primary items-center justify-center">
                  <Text className="text-white text-3xl font-bold">{initials}</Text>
                </View>
              )}
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
          <TextField label="Số điện thoại" value={phoneNumber} onChangeText={(v) => { setPhoneNumber(v); setErrors((p) => ({ ...p, phoneNumber: '' })); }} keyboardType="phone-pad" icon="phone-outline" error={errors.phoneNumber} />
          <TextField label="Địa chỉ" value={address} onChangeText={setAddress} icon="map-marker-outline" />

          <Divider />

          {/* Bank */}
          <Text variant="label" tone="muted">Tài khoản ngân hàng (nhận lương)</Text>
          <TextField label="Ngân hàng (VCB, BIDV, MB...)" value={bankCode} onChangeText={setBankCode} autoCapitalize="characters" icon="bank-outline" />
          <TextField label="Số tài khoản" value={bankNo} onChangeText={setBankNo} keyboardType="number-pad" icon="credit-card-outline" />

          <Divider />

          {/* ID card */}
          <Text variant="label" tone="muted">Căn cước công dân (CCCD)</Text>
          <Text variant="caption" tone="faint">Chạm vào từng ô để chọn ảnh mặt trước và mặt sau</Text>
          <View className="flex-row gap-3">
            <IdCardSlot label="Mặt trước" uri={profile?.idCardFrontUrl ? getStorageUrl(profile.idCardFrontUrl) : undefined} uploading={uploadingFront} onPick={() => handlePickIdCard('front')} />
            <IdCardSlot label="Mặt sau" uri={profile?.idCardBackUrl ? getStorageUrl(profile.idCardBackUrl) : undefined} uploading={uploadingBack} onPick={() => handlePickIdCard('back')} />
          </View>

          <Button icon="content-save-outline" loading={submitting} onPress={handleSubmit} className="mt-2">{t('common.save')}</Button>
          <View className="h-8" />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
