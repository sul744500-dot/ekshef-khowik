// رمز الجلسة يُحفظ في sessionStorage (لكل تبويب) ليستأنف اللاعب تلقائيًا بعد التحديث أو انقطاع النت،
// ونسخة في localStorage لعرض خيار "ارجع كـ…" إذا أُغلق التبويب. لا حسابات ولا كلمات مرور.

const tokenKey = (code: string) => `ekshef:token:${code}`;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const getTabToken = (code: string) => safe(() => sessionStorage.getItem(tokenKey(code)), null);
export const getSavedToken = (code: string) => safe(() => localStorage.getItem(tokenKey(code)), null);

export function saveToken(code: string, token: string) {
  safe(() => sessionStorage.setItem(tokenKey(code), token), undefined);
  safe(() => localStorage.setItem(tokenKey(code), token), undefined);
}

export function clearToken(code: string) {
  safe(() => sessionStorage.removeItem(tokenKey(code)), undefined);
  safe(() => localStorage.removeItem(tokenKey(code)), undefined);
}

export function clearTabToken(code: string) {
  safe(() => sessionStorage.removeItem(tokenKey(code)), undefined);
}

export interface Profile {
  name: string;
  avatar: string;
}

export function getLastProfile(): Profile | null {
  return safe(() => JSON.parse(localStorage.getItem("ekshef:profile") ?? "null") as Profile | null, null);
}

export function saveLastProfile(p: Profile) {
  safe(() => localStorage.setItem("ekshef:profile", JSON.stringify(p)), undefined);
}

/** مسودة نص (سؤال أو إجابة) تبقى لو تحدثت الصفحة أثناء الكتابة */
export const getDraft = (key: string) => safe(() => sessionStorage.getItem(`ekshef:draft:${key}`) ?? "", "");
export const saveDraft = (key: string, text: string) =>
  safe(() => (text ? sessionStorage.setItem(`ekshef:draft:${key}`, text) : sessionStorage.removeItem(`ekshef:draft:${key}`)), undefined);
