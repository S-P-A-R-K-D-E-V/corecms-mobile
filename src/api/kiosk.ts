import axios, { endpoints } from './axios';
import type { IKioskClaimRequest, IKioskClaimResponse, IKioskDeviceItem } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Ghép nối / quản trị thiết bị Kiosk từ app — dùng JWT thường (Admin/Manager), KHÔNG phải
// X-Kiosk-Key của chính thiết bị kiosk (đó là của web /kiosk-checkin, xem KioskPairingController).

export async function claimKioskPairing(data: IKioskClaimRequest): Promise<IKioskClaimResponse> {
  const response = await axios.post<IKioskClaimResponse>(endpoints.kiosk.pairingClaim, data);
  return response.data;
}

export async function getKioskDevices(): Promise<IKioskDeviceItem[]> {
  const response = await axios.get<IKioskDeviceItem[]>(endpoints.kiosk.devices);
  return response.data;
}

export async function revokeKioskDevice(deviceId: string): Promise<void> {
  await axios.post(endpoints.kiosk.deviceRevoke(deviceId));
}
