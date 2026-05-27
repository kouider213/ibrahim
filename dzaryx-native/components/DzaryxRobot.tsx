/**
 * DzaryxRobot — Animated SVG robot component
 * Requires: npx expo install react-native-svg
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, {
  Circle, Rect, Path, Line, Ellipse, Text as SvgText,
  Defs, RadialGradient, LinearGradient, Stop,
  Filter, FeGaussianBlur, FeMerge, FeMergeNode,
  G,
} from 'react-native-svg';

export type RobotState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'vision';

const STATE_COLOR: Record<RobotState, string> = {
  idle:      '#00d4ff',
  listening: '#ff3366',
  thinking:  '#ffaa00',
  speaking:  '#00e676',
  vision:    '#9b59b6',
};

const HEAD_METAL: Record<RobotState, [string, string, string]> = {
  idle:      ['#5a8090', '#1e3048', '#06111e'],
  listening: ['#5a3040', '#1e1228', '#080410'],
  thinking:  ['#604020', '#261808', '#0a0600'],
  speaking:  ['#1a5038', '#0a2018', '#020a06'],
  vision:    ['#3a1858', '#160a28', '#060212'],
};

interface Props {
  state: RobotState;
  size?: number;
}

const AnimCircle = Animated.createAnimatedComponent(Circle);
const AnimRect   = Animated.createAnimatedComponent(Rect);
const AnimG      = Animated.createAnimatedComponent(G);
const AnimEllipse = Animated.createAnimatedComponent(Ellipse);

export default function DzaryxRobot({ state, size = 290 }: Props) {
  const col = STATE_COLOR[state];
  const [h0, h1, h2] = HEAD_METAL[state];

  // Float animation
  const floatY = useRef(new Animated.Value(0)).current;
  // Eye glow pulse
  const eyePulse = useRef(new Animated.Value(0.85)).current;
  // Antenna blink
  const antBlink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -6, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatY, { toValue:  0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    float.start();
    return () => float.stop();
  }, [floatY]);

  useEffect(() => {
    const eye = Animated.loop(
      Animated.sequence([
        Animated.timing(eyePulse, { toValue: 1.0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(eyePulse, { toValue: 0.7, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    eye.start();
    return () => eye.stop();
  }, [eyePulse]);

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(antBlink, { toValue: 0.2, duration: 300, useNativeDriver: false }),
        Animated.timing(antBlink, { toValue: 1.0, duration: 300, useNativeDriver: false }),
        Animated.delay(1400),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [antBlink]);

  const scale = size / 290;
  const h = Math.round(355 * scale);

  return (
    <Animated.View style={{ transform: [{ translateY: floatY }] }}>
      <Svg width={size} height={h} viewBox="0 0 290 355">
        <Defs>
          {/* Glow filter */}
          <Filter id="g6" x="-60%" y="-60%" width="220%" height="220%">
            <FeGaussianBlur stdDeviation={6} result="b"/>
            <FeMerge><FeMergeNode in="b"/><FeMergeNode in="SourceGraphic"/></FeMerge>
          </Filter>
          <Filter id="g3" x="-40%" y="-40%" width="180%" height="180%">
            <FeGaussianBlur stdDeviation={3} result="b"/>
            <FeMerge><FeMergeNode in="b"/><FeMergeNode in="SourceGraphic"/></FeMerge>
          </Filter>

          {/* Head metal gradient */}
          <RadialGradient id="hm" cx="38%" cy="30%" r="65%">
            <Stop offset="0%"   stopColor={h0}/>
            <Stop offset="35%"  stopColor={h1}/>
            <Stop offset="100%" stopColor={h2}/>
          </RadialGradient>

          {/* Ear metal */}
          <RadialGradient id="em" cx="30%" cy="30%" r="65%">
            <Stop offset="0%"   stopColor={h1}/>
            <Stop offset="100%" stopColor={h2}/>
          </RadialGradient>

          {/* Body gradient */}
          <LinearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%"   stopColor={h1}/>
            <Stop offset="100%" stopColor={h2}/>
          </LinearGradient>

          {/* Eye iris */}
          <RadialGradient id="eye" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor="white" stopOpacity={0.9}/>
            <Stop offset="50%"  stopColor={col}/>
            <Stop offset="100%" stopColor={col} stopOpacity={0}/>
          </RadialGradient>

          {/* Platform glow */}
          <RadialGradient id="pg" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={col} stopOpacity={0.5}/>
            <Stop offset="100%" stopColor={col} stopOpacity={0}/>
          </RadialGradient>
        </Defs>

        {/* PLATFORM */}
        <Ellipse cx={145} cy={346} rx={90} ry={13} fill="url(#pg)"/>
        <Ellipse cx={145} cy={346} rx={89} ry={12} fill="none" stroke={col} strokeWidth={0.6} opacity={0.5}/>
        <Ellipse cx={145} cy={346} rx={62} ry={7}  fill="none" stroke={col} strokeWidth={0.9} opacity={0.8}/>

        {/* THINKING HALO (only for thinking state) */}
        {state === 'thinking' && <>
          <Circle cx={145} cy={155} r={118} fill="none" stroke={col} strokeWidth={1.2} strokeDasharray="6 4" opacity={0.25}/>
          <Circle cx={145} cy={155} r={113} fill="none" stroke={col} strokeWidth={0.7} strokeDasharray="3 8" opacity={0.18}/>
        </>}

        {/* LEFT EAR */}
        <Circle cx={45} cy={155} r={43} fill="url(#em)" stroke={col} strokeWidth={0.9} opacity={0.8}/>
        <Circle cx={45} cy={155} r={36} fill="none"     stroke={col} strokeWidth={0.4} opacity={0.2}/>
        {earBars(8, state, col)}

        {/* RIGHT EAR */}
        <Circle cx={245} cy={155} r={43} fill="url(#em)" stroke={col} strokeWidth={0.9} opacity={0.8}/>
        <Circle cx={245} cy={155} r={36} fill="none"     stroke={col} strokeWidth={0.4} opacity={0.2}/>
        {earBars(251, state, col)}

        {/* HEAD */}
        <Circle cx={145} cy={155} r={103} fill="none"     stroke={col} strokeWidth={0.8} opacity={0.08}/>
        <Circle cx={145} cy={155} r={100} fill="url(#hm)" stroke={col} strokeWidth={0.5} opacity={0.3}/>
        <Ellipse cx={110} cy={108} rx={38} ry={24} fill="white" opacity={0.05} transform="rotate(-20 110 108)"/>

        {/* NECK */}
        <Rect x={125} y={252} width={40} height={18} rx={6} fill={h2} stroke={col} strokeWidth={0.5} opacity={0.4}/>
        <Line x1={145} y1={255} x2={145} y2={267} stroke={col} strokeWidth={0.5} opacity={0.25}/>

        {/* BODY */}
        <Rect x={72} y={264} width={146} height={76} rx={16} fill="url(#bg)" stroke={col} strokeWidth={0.8} opacity={0.78}/>
        <Rect x={82} y={264} width={126} height={3}  rx={1.5} fill={col} opacity={0.1}/>
        <Rect x={72} y={280} width={3}   height={30} rx={1.5} fill={col} opacity={0.18}/>
        <Rect x={215} y={280} width={3}  height={30} rx={1.5} fill={col} opacity={0.18}/>

        <SvgText
          x={145} y={292}
          fontFamily="monospace" fontSize={12} fontWeight="bold"
          fill={col} textAnchor="middle"
          letterSpacing={3} opacity={0.88}
        >
          DZARYX
        </SvgText>

        <Line x1={82} y1={302} x2={208} y2={302} stroke={col} strokeWidth={0.5} opacity={0.2}/>
        <Circle cx={100} cy={315} r={4}   fill={col} opacity={0.85}/>
        <Circle cx={114} cy={315} r={4}   fill="#00e676" opacity={0.6}/>
        <Circle cx={128} cy={315} r={3.5} fill="#ffaa00" opacity={0.45}/>
        <Circle cx={141} cy={315} r={3}   fill={col} opacity={0.28}/>
        <Rect x={155} y={311} width={42} height={8} rx={4} fill={col} fillOpacity={0.04} stroke={col} strokeWidth={0.5} strokeOpacity={0.25}/>
        <Rect x={157} y={313} width={24} height={4} rx={2} fill={col} opacity={0.42}/>

        {/* VISOR */}
        <Rect x={75} y={128} width={140} height={60} rx={12} fill={h2} opacity={0.93}/>
        <Rect x={75} y={128} width={140} height={60} rx={12} fill="none" stroke={col} strokeWidth={0.5} opacity={0.3}/>
        {[140, 152, 164, 176].map(y => (
          <Line key={y} x1={77} y1={y} x2={213} y2={y} stroke={col} strokeWidth={0.3} opacity={0.07}/>
        ))}

        {/* VISION scan lines (vision state only) */}
        {state === 'vision' && [132,138,144,150,156,162,168,174,180].map(y => (
          <Line key={y} x1={77} y1={y} x2={213} y2={y} stroke={col} strokeWidth={0.4} opacity={0.1}/>
        ))}

        {/* LEFT EYE */}
        {state === 'vision' ? <VisionEye cx={113} col={col}/> : <LEDEye cx={113} col={col} eyePulse={eyePulse}/>}

        {/* RIGHT EYE */}
        {state === 'vision' ? <VisionEye cx={177} col={col}/> : <LEDEye cx={177} col={col} eyePulse={eyePulse}/>}

        {/* MOUTH */}
        {state === 'speaking' && <SpeakingMouth col={col}/>}
        {state === 'thinking' && <ThinkingMouth col={col}/>}
        {state === 'vision'   && <Line x1={122} y1={184} x2={168} y2={184} stroke={col} strokeWidth={1.8} strokeLinecap="round" opacity={0.5}/>}
        {(state === 'idle' || state === 'listening') && (
          <Path d="M 118 183 Q 145 200 172 183" fill="none" stroke={col} strokeWidth={2.5} strokeLinecap="round" opacity={0.7}/>
        )}

        {/* ANTENNA */}
        <Line x1={145} y1={56} x2={145} y2={70} stroke={col} strokeWidth={1.5} strokeLinecap="round" opacity={0.5}/>
        <AnimCircle cx={145} cy={51} r={6} fill={col} opacity={antBlink}/>
        <Circle     cx={145} cy={51} r={3.5} fill="white" opacity={0.6}/>
      </Svg>
    </Animated.View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LEDEye({ cx, col, eyePulse }: { cx: number; col: string; eyePulse: Animated.Value }) {
  const cy = 153;
  return (
    <>
      <AnimCircle cx={cx} cy={cy} r={eyePulse.interpolate({ inputRange: [0.7, 1], outputRange: [22, 26] })} fill={col} opacity={0.04}/>
      <Circle cx={cx} cy={cy} r={17} fill={col} opacity={0.14}/>
      <Circle cx={cx} cy={cy} r={13} fill={col} opacity={0.26}/>
      <Circle cx={cx} cy={cy} r={9}  fill="url(#eye)"/>
      <Circle cx={cx} cy={cy} r={5}  fill="white" opacity={0.88}/>
      <Circle cx={cx - 4} cy={cy - 4} r={2.5} fill="white" opacity={0.65}/>
    </>
  );
}

function VisionEye({ cx, col }: { cx: number; col: string }) {
  const cy = 153;
  return (
    <>
      <Circle cx={cx} cy={cy} r={17} fill="none" stroke={col} strokeWidth={1} opacity={0.4}/>
      <Circle cx={cx} cy={cy} r={13} fill={col} opacity={0.2}/>
      <Circle cx={cx} cy={cy} r={8}  fill="none" stroke="white" strokeWidth={0.7} opacity={0.45}/>
      <Circle cx={cx} cy={cy} r={5}  fill={col} opacity={0.9}/>
      <Circle cx={cx} cy={cy} r={2}  fill="white" opacity={0.7}/>
      {/* Aperture lines */}
      <Line x1={cx}     y1={cy - 17} x2={cx}     y2={cy - 22} stroke={col} strokeWidth={1.2} opacity={0.5}/>
      <Line x1={cx}     y1={cy + 17} x2={cx}     y2={cy + 22} stroke={col} strokeWidth={1.2} opacity={0.5}/>
      <Line x1={cx - 17} y1={cy}     x2={cx - 22} y2={cy}     stroke={col} strokeWidth={1.2} opacity={0.5}/>
      <Line x1={cx + 17} y1={cy}     x2={cx + 22} y2={cy}     stroke={col} strokeWidth={1.2} opacity={0.5}/>
    </>
  );
}

function SpeakingMouth({ col }: { col: string }) {
  return (
    <>
      <Rect x={116} y={178} width={58} height={14} rx={5} fill={col} fillOpacity={0.12} stroke={col} strokeWidth={1}/>
      {[120, 131, 142, 153, 164].map((x, i) => (
        <Rect key={x} x={x} y={181} width={8} height={8} rx={2} fill={col} opacity={0.55 + i * 0.1}/>
      ))}
    </>
  );
}

function ThinkingMouth({ col }: { col: string }) {
  return (
    <>
      <Circle cx={128} cy={186} r={3} fill={col} opacity={0.5}/>
      <Circle cx={145} cy={187} r={3} fill={col} opacity={0.7}/>
      <Circle cx={162} cy={186} r={3} fill={col} opacity={0.5}/>
    </>
  );
}

// ── Ear bars helper ───────────────────────────────────────────────────────────

const EAR_HEIGHTS: Record<RobotState, number[]> = {
  idle:      [4,  8,  12, 16, 12, 8,  4],
  listening: [10, 20, 30, 36, 26, 16, 8],
  thinking:  [2,  6,  10, 14, 10, 6,  2],
  speaking:  [6,  14, 22, 30, 18, 10, 4],
  vision:    [2,  6,  10, 14, 10, 6,  2],
};

function earBars(startX: number, state: RobotState, col: string) {
  const heights = EAR_HEIGHTS[state];
  const opacities = [0.45, 0.6, 0.78, 0.95, 0.78, 0.6, 0.45];
  return heights.map((h, i) => (
    <Rect
      key={i}
      x={startX + i * 5}
      y={155 - h / 2}
      width={3}
      height={h}
      rx={1.5}
      fill={col}
      opacity={opacities[i]}
    />
  ));
}
