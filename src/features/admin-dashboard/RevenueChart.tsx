import { useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import dayjs from 'dayjs';

import { Text } from 'src/components/ui';
import { brand } from 'src/theme';
import type { IRevenuePeriod } from 'src/types/corecms-api';
import { fmtCompact } from './hooks';

// ----------------------------------------------------------------------
// Biểu đồ cột doanh thu theo ngày. Vẽ bằng react-native-svg (không thêm
// lib chart) — nhẹ, hợp với ràng buộc tài nguyên VPS/app.
// ----------------------------------------------------------------------

const CHART_H = 140;
const BAR_GAP = 4;

export function RevenueChart({ periods }: { periods: IRevenuePeriod[] }) {
  const [width, setWidth] = useState(0);

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const max = Math.max(1, ...periods.map((p) => p.revenue));
  const n = periods.length;
  const barW = n > 0 && width > 0 ? Math.max(3, (width - BAR_GAP * (n - 1)) / n) : 0;

  // Nhãn trục X: chỉ hiển thị mốc đầu / giữa / cuối để tránh chồng chữ.
  const labelIdx = new Set([0, Math.floor(n / 2), n - 1]);

  return (
    <View className="gap-2">
      <View onLayout={onLayout} style={{ height: CHART_H }}>
        {width > 0 && n > 0 ? (
          <Svg width={width} height={CHART_H}>
            <Defs>
              <SvgGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={brand.primary} stopOpacity="1" />
                <Stop offset="1" stopColor={brand.primary} stopOpacity="0.35" />
              </SvgGradient>
            </Defs>
            {periods.map((p, i) => {
              const h = Math.max(2, (p.revenue / max) * (CHART_H - 8));
              const x = i * (barW + BAR_GAP);
              const y = CHART_H - h;
              return (
                <Rect
                  key={p.period}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={Math.min(4, barW / 2)}
                  fill="url(#barFill)"
                />
              );
            })}
          </Svg>
        ) : null}
      </View>

      <View className="flex-row justify-between">
        {periods.map((p, i) =>
          labelIdx.has(i) ? (
            <Text key={p.period} variant="caption" tone="muted" className="text-[10px]">
              {dayjs(p.period).isValid() ? dayjs(p.period).format('DD/MM') : p.period}
            </Text>
          ) : (
            <View key={p.period} />
          )
        )}
      </View>

      <View className="flex-row items-center justify-end gap-1">
        <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: brand.primary }} />
        <Text variant="caption" tone="muted">
          Cao nhất: {fmtCompact(max)}
        </Text>
      </View>
    </View>
  );
}
