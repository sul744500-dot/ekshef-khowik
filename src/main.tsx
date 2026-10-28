import { createRoot } from "react-dom/client";
import { App } from "./App";
import { unlockAudio } from "./lib/sound";
import "./index.css";

// Safari يشترط لمسة من المستخدم قبل تشغيل أي صوت
window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

createRoot(document.getElementById("root")!).render(<App />);
