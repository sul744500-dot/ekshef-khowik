import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Lang } from "../../shared/types";
import { STRINGS, type Strings } from "./i18n";

interface LangValue {
  lang: Lang;
  t: Strings;
}

const LangContext = createContext<LangValue>({ lang: "ar", t: STRINGS.ar });

let active: Strings = STRINGS.ar;
/** النصوص الحالية لاستخدامها خارج React (رسائل الأخطاء العائمة) */
export const activeStrings = () => active;

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = STRINGS[lang];
  active = t;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
  }, [lang, t.dir]);
  return <LangContext.Provider value={{ lang, t }}>{children}</LangContext.Provider>;
}

export const useT = () => useContext(LangContext);
