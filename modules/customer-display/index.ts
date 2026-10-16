import { requireOptionalNativeModule } from 'expo';

// ----------------------------------------------------------------------
// Module native "CustomerDisplay" (modules/customer-display/android): màn hình khách trên màn phụ của máy quầy Android
// (Presentation). Bản app chưa build kèm module (bản cài từ trước, iOS) → null, mọi lệnh thành không làm gì.

type Subscription = { remove: () => void };

export type CustomerDisplayNative = {
  isAvailable(): boolean;
  render(state: string): void;
  hide(): void;
  setKeepAwake(on: boolean): void;
  addListener(event: 'onDisplayChange', listener: (e: { available: boolean }) => void): Subscription;
};

export const CustomerDisplayModule = requireOptionalNativeModule<CustomerDisplayNative>('CustomerDisplay');
