// اهتزاز خفيف على الجوال، فقط بعد ما يلمس اللاعب الصفحة (المتصفح يرفضه قبل ذلك)
export function vibrate(pattern: number | number[]) {
  try {
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    navigator.vibrate?.(pattern);
  } catch {
    // غير مدعوم
  }
}
