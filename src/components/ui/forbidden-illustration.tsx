import Svg, { Defs, LinearGradient, Stop, Circle, Path, G } from 'react-native-svg';

// ----------------------------------------------------------------------
// Minh hoạ 403 — khiên + ổ khoá, tông hồng brand. Thay cho ForbiddenIllustration
// (MUI) bên core-fe, dựng lại bằng react-native-svg cho app-mobile.
// ----------------------------------------------------------------------

export type ForbiddenIllustrationProps = {
  size?: number;
};

export function ForbiddenIllustration({ size = 200 }: ForbiddenIllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240" fill="none">
      <Defs>
        <LinearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F8BBD0" />
          <Stop offset="0.55" stopColor="#D86A88" />
          <Stop offset="1" stopColor="#A83C5D" />
        </LinearGradient>
        <LinearGradient id="lockGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#FFE5EC" />
        </LinearGradient>
      </Defs>

      {/* Soft halo */}
      <Circle cx="120" cy="120" r="104" fill="#C84D71" opacity={0.08} />
      <Circle cx="120" cy="120" r="78" fill="#C84D71" opacity={0.06} />

      {/* Shield */}
      <Path
        d="M120 36 L186 62 V120 C186 162 158 192 120 206 C82 192 54 162 54 120 V62 Z"
        fill="url(#shieldGrad)"
      />
      {/* Inner top highlight (glass feel) */}
      <Path
        d="M120 44 L178 67 V97 C178 97 150 86 120 86 C90 86 62 97 62 97 V67 Z"
        fill="#FFFFFF"
        opacity={0.12}
      />

      {/* Lock */}
      <G>
        {/* Shackle */}
        <Path
          d="M102 116 V104 C102 94 110 86 120 86 C130 86 138 94 138 104 V116"
          stroke="url(#lockGrad)"
          strokeWidth={9}
          strokeLinecap="round"
          fill="none"
        />
        {/* Body */}
        <Path
          d="M96 116 H144 C148 116 151 119 151 123 V152 C151 156 148 159 144 159 H96 C92 159 89 156 89 152 V123 C89 119 92 116 96 116 Z"
          fill="url(#lockGrad)"
        />
        {/* Keyhole */}
        <Circle cx="120" cy="132" r="7" fill="#A83C5D" />
        <Path d="M117 137 H123 L125 150 H115 Z" fill="#A83C5D" />
      </G>
    </Svg>
  );
}
