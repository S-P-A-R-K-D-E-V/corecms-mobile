import {
  TICK_COUNT,
  coverage,
  createYawCalibrator,
  headDirection,
  isDone,
  isStraight,
  noseOffset,
  placement,
  sectorFor,
  ticksFor,
} from '../face-id-geometry';

// Đăng ký khuôn mặt kiểu Face ID: khuôn mặt nằm trong khung tròn, hướng đầu → vạch sáng trên viền, chụp ảnh theo hướng.

const circle = { cx: 200, cy: 300, r: 130 };
const face = (cx: number, cy: number, w: number) => ({ x: cx - w / 2, y: cy - w * 0.6, width: w, height: w * 1.2 });

describe('placement', () => {
  it('needs exactly one face centred in the circle at a sensible size', () => {
    expect(placement([], circle)).toBe('none');
    expect(placement([face(200, 300, 160)], circle)).toBe('ok');
    expect(placement([face(200, 300, 160), face(120, 200, 120)], circle)).toBe('multi');
    expect(placement([face(320, 300, 160)], circle)).toBe('outside');
    expect(placement([face(200, 300, 80)], circle)).toBe('far');
    expect(placement([face(200, 300, 320)], circle)).toBe('near');
  });

  it('ignores a small face far in the background', () => {
    expect(placement([face(200, 300, 160), face(60, 120, 30)], circle)).toBe('ok');
  });
});

describe('head direction', () => {
  it('maps yaw to the screen side through the calibrated sign and pitch to up/down', () => {
    expect(headDirection(-20, 0, -1).angle).toBeCloseTo(0); // phải màn hình
    expect(headDirection(20, 0, -1).angle).toBeCloseTo(180); // trái màn hình
    expect(headDirection(0, 15, -1).angle).toBeCloseTo(90); // ngước lên
    expect(headDirection(0, -15, -1).angle).toBeCloseTo(270); // cúi xuống
    expect(headDirection(-15, 15, -1).angle).toBeCloseTo(45);
    expect(headDirection(30, 40, 1).magnitude).toBeCloseTo(50);
  });

  it('learns the yaw sign from where the nose sits between the eyes', () => {
    const cal = createYawCalibrator(-1);
    expect(cal.sign()).toBe(-1);
    // Mũi lệch sang phải màn hình khi yaw dương → yaw dương = phải màn hình.
    for (let i = 0; i < 3; i++) cal.observe(20, noseOffset({ x: 100, y: 100 }, { x: 160, y: 100 }, { x: 145, y: 130 }));
    expect(cal.sign()).toBe(1);
    // Quan sát mờ (đầu gần thẳng) không tính.
    cal.observe(5, -0.3);
    cal.observe(20, 0.01);
    expect(cal.sign()).toBe(1);
  });

  it('treats a nearly frontal pose as straight and lights nothing', () => {
    expect(isStraight(3, -5)).toBe(true);
    expect(isStraight(12, 0)).toBe(false);
    expect(ticksFor(90, 5)).toEqual([]);
  });
});

describe('ticks', () => {
  it('lights a band of ticks around the head direction, wrapping at 0°', () => {
    expect(ticksFor(90, 15)).toEqual([15, 16, 17, 18, 19, 20, 21]);
    expect(ticksFor(0, 15)).toEqual([69, 70, 71, 0, 1, 2, 3]);
  });

  it('is done once most of the ring is lit and enough angle photos were taken', () => {
    const lit = Array.from({ length: TICK_COUNT }, (_, i) => i < 63);
    expect(coverage(lit)).toBeCloseTo(0.875);
    expect(isDone(lit, 3)).toBe(true);
    expect(isDone(lit, 2)).toBe(false);
    expect(isDone(Array.from({ length: TICK_COUNT }, (_, i) => i < 40), 4)).toBe(false);
  });
});

describe('sectorFor', () => {
  it('takes an angle photo only for a clear but moderate turn near a main direction', () => {
    expect(sectorFor(5, 18)).toBe('right');
    expect(sectorFor(100, 15)).toBe('up');
    expect(sectorFor(185, 20)).toBe('left');
    expect(sectorFor(260, 14)).toBe('down');
    expect(sectorFor(45, 20)).toBeNull(); // chéo
    expect(sectorFor(0, 8)).toBeNull(); // chưa đủ nghiêng
    expect(sectorFor(0, 40)).toBeNull(); // quá nghiêng
  });
});
