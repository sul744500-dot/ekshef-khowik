import { useCallback, useEffect, useRef, useState } from "react";
import type { AckResult, ActionEnvelope, GameAction, JoinResult, PeekResult, RoomView } from "../../shared/types";
import { syncClock } from "../lib/clock";
import { errorText } from "../lib/i18n";
import { activeStrings } from "../lib/lang";
import { clearTabToken, clearToken, getSavedToken, getTabToken, saveToken } from "../lib/session";
import { getSocket, request } from "../lib/socket";
import { play, setRoomSounds } from "../lib/sound";
import { toast } from "../lib/toast";

export type Conn =
  | { kind: "loading" }
  | { kind: "join"; peek: PeekResult }
  | { kind: "in" }
  | { kind: "missing" }
  | { kind: "kicked" }
  | { kind: "replaced" }
  | { kind: "left" };

const TERMINAL = new Set<Conn["kind"]>(["kicked", "replaced", "left", "missing"]);

export function useRoom(code: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [conn, setConnState] = useState<Conn>({ kind: "loading" });
  const [online, setOnline] = useState(true);
  const connRef = useRef<Conn>(conn);
  const viewRef = useRef<RoomView | null>(null);

  const setConn = useCallback((c: Conn) => {
    connRef.current = c;
    setConnState(c);
  }, []);

  /** يستأنف الجلسة المحفوظة في هذا التبويب، وإلا يعرض نموذج الانضمام */
  const enter = useCallback(async () => {
    const token = getTabToken(code);
    if (token) {
      const r = await request<JoinResult>("room:resume", { code, token });
      if (r.ok) {
        saveToken(code, r.token);
        setConn({ kind: "in" });
        return;
      }
      if (r.error === "room-not-found") {
        clearToken(code);
        setConn({ kind: "missing" });
        return;
      }
      if (r.error === "no-connection") return; // نعيد المحاولة عند رجوع الاتصال
      clearTabToken(code);
    }
    const peek = await request<PeekResult>("room:peek", { code, token: getSavedToken(code) });
    if (!peek.ok) return;
    if (!peek.exists) setConn({ kind: "missing" });
    else setConn({ kind: "join", peek });
  }, [code, setConn]);

  useEffect(() => {
    const s = getSocket();
    const onConnect = () => {
      setOnline(true);
      if (!TERMINAL.has(connRef.current.kind)) void enter();
    };
    const onDisconnect = () => setOnline(false);
    const onState = (v: RoomView) => {
      if (v.code !== code) return;
      syncClock(v.serverNow);
      setRoomSounds(v.settings.sounds);
      viewRef.current = v;
      setView(v);
    };
    const onKicked = () => {
      clearToken(code);
      viewRef.current = null;
      setView(null);
      setConn({ kind: "kicked" });
      play("eliminate");
    };
    const onReplaced = () => setConn({ kind: "replaced" });
    const onClosed = () => {
      clearToken(code);
      setConn({ kind: "missing" });
    };
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("room:state", onState);
    s.on("room:kicked", onKicked);
    s.on("room:replaced", onReplaced);
    s.on("room:closed", onClosed);
    if (s.connected) void enter();
    else setOnline(false);
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("room:state", onState);
      s.off("room:kicked", onKicked);
      s.off("room:replaced", onReplaced);
      s.off("room:closed", onClosed);
    };
  }, [code, enter, setConn]);

  const join = useCallback(
    async (name: string, avatar: string): Promise<string | null> => {
      const r = await request<JoinResult>("room:join", { code, name, avatar });
      if (!r.ok) return r.error;
      saveToken(code, r.token);
      setConn({ kind: "in" });
      return null;
    },
    [code, setConn],
  );

  /** "ارجع كـ…": يستأنف بجلسة محفوظة من تبويب سابق، أو يستعيد الجلسة بعد فتحها في تبويب آخر */
  const resume = useCallback(async (): Promise<string | null> => {
    const token = getTabToken(code) ?? getSavedToken(code);
    if (!token) return "session-expired";
    const r = await request<JoinResult>("room:resume", { code, token });
    if (!r.ok) {
      if (r.error !== "no-connection") {
        clearToken(code);
        await enter();
      }
      return r.error;
    }
    saveToken(code, r.token);
    setConn({ kind: "in" });
    return null;
  }, [code, enter, setConn]);

  const act = useCallback(async (action: GameAction): Promise<AckResult> => {
    const v = viewRef.current;
    const envelope: ActionEnvelope = { ...action, expectPhase: v?.phase, expectSeq: v?.match?.seq ?? 0 };
    const r = await request("action", envelope);
    if (!r.ok && !r.quiet) {
      toast(errorText(activeStrings(), r.error), "bad");
      play("error");
    }
    return r;
  }, []);

  const leave = useCallback(async () => {
    await request("room:leave", {});
    clearToken(code);
    setConn({ kind: "left" });
  }, [code, setConn]);

  return { view, conn, online, join, resume, act, leave };
}

export type RoomApi = ReturnType<typeof useRoom>;
