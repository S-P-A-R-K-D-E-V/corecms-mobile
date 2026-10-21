jest.mock('expo-updates', () => ({ runtimeVersion: '1.0.3' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import React from 'react';
import { Linking, Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { UpdateRequired } from '../UpdateRequired';

// Bản 1.0.2 / 1.0.3 đã đóng: màn chặn chỉ còn nút mở chợ để cập nhật.

describe('UpdateRequired', () => {
  it('shows the closed version and opens the store listing', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<UpdateRequired version="1.0.3" />);

    expect(screen.getByText(/1\.0\.3/)).toBeTruthy();
    fireEvent.press(screen.getByText('Cập nhật ngay'));
    await Promise.resolve();

    expect(open).toHaveBeenCalledWith(
      Platform.OS === 'ios' ? 'itms-apps://apps.apple.com/app/id6818444586' : 'market://details?id=com.devbyspark.store',
    );
  });
});
