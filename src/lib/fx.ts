import confetti from "canvas-confetti";

// احتفالات بصرية خفيفة (تتوقف تلقائيًا لمن يفضّل تقليل الحركة)

const COLORS = ["#a78bfa", "#60a5fa", "#22d3ee", "#f472b6", "#facc15", "#ffffff"];

export function burst(power = 1) {
  void confetti({
    particleCount: Math.round(120 * power),
    spread: 80,
    startVelocity: 45 * Math.min(1.4, power),
    origin: { y: 0.6 },
    colors: COLORS,
    disableForReducedMotion: true,
  });
}

export function sideCannons() {
  const end = Date.now() + 1400;
  const frame = () => {
    void confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: COLORS, disableForReducedMotion: true });
    void confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: COLORS, disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

export function fireworks(ms = 3500) {
  const end = Date.now() + ms;
  const id = setInterval(() => {
    if (Date.now() > end) return clearInterval(id);
    void confetti({
      particleCount: 40,
      startVelocity: 30,
      spread: 360,
      ticks: 70,
      origin: { x: 0.15 + Math.random() * 0.7, y: Math.random() * 0.4 + 0.1 },
      colors: COLORS,
      disableForReducedMotion: true,
    });
  }, 320);
}
