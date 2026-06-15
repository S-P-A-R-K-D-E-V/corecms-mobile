import Svg, { G, Path, LinearGradient, Stop, Defs } from 'react-native-svg';
import { BrandGradient } from './gradient';

/** CiCi butterfly SVG icon (re-colored from core-fe logo to CiCi rose #C84D71). */
function CiCiSvg({ size, white = false }: { size: number; white?: boolean }) {
  const h = Math.round(size * 0.52);
  return (
    <Svg width={size} height={h} viewBox="-3 3 130 65">
      {!white ? (
        <Defs>
          <LinearGradient id="la" x1="100%" x2="50%" y1="5.663%" y2="50%">
            <Stop offset="0" stopColor="#D86A88" />
            <Stop offset="1" stopColor="#C84D71" />
          </LinearGradient>
          <LinearGradient id="lb" x1="50%" x2="50%" y1="0%" y2="100%">
            <Stop offset="0" stopColor="#E97AA0" />
            <Stop offset="1" stopColor="#C84D71" />
          </LinearGradient>
        </Defs>
      ) : null}
      <G>
        <Path
          d="m23.201647 20.7766255c11.072211 5.7222379 11.5769845 5.9836488 11.6001673 5.9949956.0030619.002182.1605302.0833547 11.1981857 5.7881361-6.5178768 12.13488-10.6732912 19.3164806-12.467118 21.5448017-2.6896467 3.3424817-5.6238067 5.8732365-9.232456 7.333472-7.5864745 3.5654884-17.0175155 3.7321979-24.300426-.6760026z"
          fill={white ? 'rgba(255,255,255,0.85)' : 'url(#la)'}
        />
        <G fill={white ? 'white' : 'url(#lb)'}>
          <Path d="m107.577623 25.4315232c-11.5676985-20.2389818-23.5250947-39.3071098-37.2608683-11.3359339-1.8790566 3.5958494-3.2486415 10.5841502-6.3167547 10.5841502v-.035507c-3.0681132 0-4.4372642-6.9883008-6.3163208-10.5841502-13.7362075-27.9711759-25.6936037-8.90304789-37.2613018 11.3359339-.8705283 1.526362-1.7067736 2.9830252-2.4223774 4.2490026 26.5094528-16.7816534 24.2775849 33.9166234 46 34.3194742v.035507c21.7228491-.4028509 19.4905472-51.1011277 46-34.3199126-.71517-1.2655391-1.551415-2.7222022-2.422377-4.2485642" />
          <Path d="m109 64c6.6272 0 12-5.3728 12-12s-5.3728-12-12-12-12 5.3728-12 12 5.3728 12 12 12" />
        </G>
      </G>
    </Svg>
  );
}

/** Standalone CiCi butterfly logo — for use on neutral/white backgrounds. */
export function CiCiLogoIcon({ size = 80 }: { size?: number }) {
  return <CiCiSvg size={size} />;
}

/** App logo mark: CiCi butterfly in a brand-gradient rounded square. */
export function CiCiLogoMark({ size = 80 }: { size?: number }) {
  return (
    <BrandGradient
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.275),
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
      }}
    >
      <CiCiSvg size={Math.round(size * 0.72)} white />
    </BrandGradient>
  );
}
