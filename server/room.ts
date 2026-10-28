import {
  AVATARS,
  DEFAULT_SETTINGS,
  LIMITS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MIN_QUESTION_LENGTH,
  PLAYER_COLORS,
  POINTS,
  ROUND_LIMITS,
  TIME_CHOICES,
  TIMING,
} from "../shared/constants";
import { QUESTION_BANK } from "../shared/questions";
import type {
  Award,
  CardView,
  ErrorCode,
  FinalView,
  MatchView,
  PersonRef,
  Phase,
  PlayerStats,
  PublicPlayer,
  RevealView,
  RoomView,
  RoundRole,
  RoundSummary,
  RoundView,
  Settings,
  Standing,
  Title,
  TitleKind,
  VoidReason,
} from "../shared/types";
import { charLength, cleanText, isPlainObject, randomId, shuffle, type RandInt } from "./util";

export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly quiet = false,
  ) {
    super(code);
  }
}

export interface Player {
  id: string;
  /** سر الجلسة: يُرسل لصاحبه فقط ليستأنف بعد انقطاع الاتصال */
  token: string;
  name: string;
  avatar: string;
  color: number;
  connected: boolean;
  joinedAt: number;
  lastSeen: number;
  offlineSince: number | null;
  /** ترتيب دور المحقق في المباراة الحالية */
  order: number;
  score: number;
  stats: PlayerStats;
  investigatorTurns: number;
  targetTurns: number;
}

interface Answer {
  author: PersonRef;
  text: string;
  at: number;
}

interface Card {
  id: string;
  text: string;
  author: PersonRef;
  out: boolean;
  outAt: number | null;
  auto: boolean;
}

interface RoundResult {
  lastCardId: string;
  targetCardId: string;
  won: boolean;
  awards: Award[];
}

interface Round {
  no: number;
  seq: number;
  investigator: PersonRef;
  target: PersonRef | null;
  question: string | null;
  autoQuestion: boolean;
  /** من يُنتظر منهم الإجابة (لقطة لحظة نشر السؤال) */
  participants: string[];
  /** مشاركون غابوا طويلًا فلم نعد ننتظرهم */
  dropped: string[];
  answers: Answer[];
  /** البطاقات بعد الخلط. صاحب كل بطاقة لا يخرج من الخادم قبل الكشف */
  cards: Card[] | null;
  eliminations: number;
  result: RoundResult | null;
  voided: VoidReason | null;
}

interface Match {
  no: number;
  seq: number;
  completed: number;
  lastInvestigatorOrder: number;
  lastTargetId: string | null;
  /** أزواج "محقق>مطلوب" سبقت، لتقليل تكرار نفس الاختيار */
  pairs: string[];
  usedQuestions: number[];
}

export interface RoomState {
  code: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  hostId: string | null;
  hostOfflineSince: number | null;
  phase: Phase;
  phaseStartedAt: number;
  deadline: number | null;
  settings: Settings;
  players: Player[];
  orderCounter: number;
  matchCount: number;
  match: Match | null;
  round: Round | null;
  history: RoundSummary[];
  final: FinalView | null;
}

export interface RoomOptions {
  maxPlayersCap?: number;
  rand: RandInt;
  now: () => number;
}

const ROUND_PHASES: readonly Phase[] = ["pick", "announce", "question", "answering", "investigation", "countdown"];
const CARD_PHASES: readonly Phase[] = ["investigation", "countdown", "reveal"];

const emptyStats = (): PlayerStats => ({ investigated: 0, found: 0, targeted: 0, escaped: 0, fooled: 0 });
const str = (v: unknown) => (typeof v === "string" ? v : "");
const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
const isAvatar = (v: unknown): v is string => typeof v === "string" && (AVATARS as readonly string[]).includes(v);

/**
 * غرفة لعب واحدة. كل القرارات (الأدوار، المراحل، الخلط، النقاط) تُتخذ هنا على الخادم،
 * والواجهة تستلم فقط ما يسمح لها برؤيته عبر buildView.
 */
export class Room {
  onChange: (() => void) | null = null;
  private readonly cap: number;

  constructor(
    readonly state: RoomState,
    private readonly opts: RoomOptions,
  ) {
    this.cap = Math.min(opts.maxPlayersCap ?? MAX_PLAYERS, MAX_PLAYERS);
  }

  static create(code: string, opts: RoomOptions): Room {
    const now = opts.now();
    const cap = Math.min(opts.maxPlayersCap ?? MAX_PLAYERS, MAX_PLAYERS);
    return new Room(
      {
        code,
        createdAt: now,
        updatedAt: now,
        version: 0,
        hostId: null,
        hostOfflineSince: null,
        phase: "lobby",
        phaseStartedAt: now,
        deadline: null,
        settings: { ...DEFAULT_SETTINGS, maxPlayers: Math.min(DEFAULT_SETTINGS.maxPlayers, cap) },
        players: [],
        orderCounter: 0,
        matchCount: 0,
        match: null,
        round: null,
        history: [],
        final: null,
      },
      opts,
    );
  }

  get code() {
    return this.state.code;
  }

  private changed() {
    this.state.updatedAt = this.opts.now();
    this.state.version++;
    this.onChange?.();
  }

  // ---------- اللاعبون ----------

  player(id: string | null | undefined): Player | undefined {
    return id ? this.state.players.find((p) => p.id === id) : undefined;
  }

  private ref(p: Player): PersonRef {
    return { id: p.id, name: p.name, avatar: p.avatar, color: p.color };
  }

  connectedPlayers(): Player[] {
    return this.state.players.filter((p) => p.connected);
  }

  connectedCount(): number {
    return this.connectedPlayers().length;
  }

  findByToken(token: unknown): Player | undefined {
    if (typeof token !== "string" || token.length < 16) return undefined;
    return this.state.players.find((p) => p.token === token);
  }

  joinBlocker(): ErrorCode | null {
    const s = this.state;
    if (s.settings.locked) return "room-locked";
    if (s.players.length >= s.settings.maxPlayers) return "room-full";
    return null;
  }

  private nameOwner(name: string, exceptId?: string): Player | undefined {
    const key = name.toLocaleLowerCase();
    return this.state.players.find((p) => p.id !== exceptId && p.name.toLocaleLowerCase() === key);
  }

  addPlayer(rawName: unknown, rawAvatar: unknown): Player {
    const s = this.state;
    const name = cleanText(rawName, LIMITS.name);
    if (!name) throw new GameError("name-required");
    const owner = this.nameOwner(name);
    if (owner) {
      // في اللوبي: لاعب بنفس الاسم انقطع وفقد جلسته، نستبدله بدل ما نقفل عليه الاسم
      if (owner.connected || s.phase !== "lobby") throw new GameError("name-taken");
      this.removePlayer(owner.id);
    }
    const blocked = this.joinBlocker();
    if (blocked) throw new GameError(blocked);
    const now = this.opts.now();
    const p: Player = {
      id: randomId(6),
      token: randomId(18),
      name,
      avatar: isAvatar(rawAvatar) ? rawAvatar : this.freeAvatar(),
      color: this.freeColor(),
      connected: false,
      joinedAt: now,
      lastSeen: now,
      offlineSince: now,
      order: ++s.orderCounter,
      score: 0,
      stats: emptyStats(),
      investigatorTurns: 0,
      targetTurns: 0,
    };
    s.players.push(p);
    if (!s.hostId) {
      s.hostId = p.id;
      s.hostOfflineSince = null;
    }
    this.changed();
    return p;
  }

  private freeAvatar(): string {
    const used = new Set(this.state.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !used.has(a));
    const pool: readonly string[] = free.length ? free : AVATARS;
    return pool[this.opts.rand(pool.length)];
  }

  private freeColor(): number {
    const counts = new Array<number>(PLAYER_COLORS).fill(0);
    for (const p of this.state.players) counts[p.color]++;
    const min = Math.min(...counts);
    const options = counts.flatMap((c, i) => (c === min ? [i] : []));
    return options[this.opts.rand(options.length)];
  }

  setConnected(id: string, connected: boolean) {
    const p = this.player(id);
    if (!p) return;
    const now = this.opts.now();
    p.lastSeen = now;
    if (p.connected === connected) return;
    p.connected = connected;
    p.offlineSince = connected ? null : now;
    if (this.state.hostId === id) this.state.hostOfflineSince = connected ? null : now;
    this.changed();
  }

  /** خروج اللاعب بنفسه */
  leave(id: string) {
    this.removePlayer(id);
  }

  private removePlayer(id: string) {
    const s = this.state;
    const idx = s.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    s.players.splice(idx, 1);
    if (s.hostId === id) this.assignNewHost();
    this.onDeparture(id);
    this.changed();
  }

  private assignNewHost() {
    const s = this.state;
    const next = [...s.players].sort((a, b) => Number(b.connected) - Number(a.connected) || a.joinedAt - b.joinedAt)[0];
    s.hostId = next?.id ?? null;
    s.hostOfflineSince = next && !next.connected ? this.opts.now() : null;
  }

  /** لاعب غادر الغرفة نهائيًا أثناء جولة */
  private onDeparture(id: string) {
    const s = this.state;
    const r = s.round;
    if (!r || !ROUND_PHASES.includes(s.phase)) return;
    if (r.investigator.id === id) {
      // في العد التنازلي النتيجة محسومة، نكمل الكشف
      if (s.phase !== "countdown") this.voidRound("investigator-left");
      return;
    }
    switch (s.phase) {
      case "pick":
        if (this.answererPool().length < 2) this.voidRound("not-enough-players");
        return;
      case "announce":
      case "question":
        if (r.target?.id === id) this.reassignTarget();
        else if (this.answererPool().length < 2) this.voidRound("not-enough-players");
        return;
      case "answering":
        if (r.target?.id === id && !this.hasAnswered(id)) this.voidRound("target-left");
        else this.checkAnswers();
        return;
      default:
        // التحقيق والعد التنازلي: بطاقته تبقى وتنكشف باسمه
        return;
    }
  }

  /** اللاعبون المتصلون غير المحقق */
  private answererPool(): Player[] {
    const inv = this.state.round?.investigator.id;
    return this.connectedPlayers().filter((p) => p.id !== inv);
  }

  // ---------- الأوامر ----------

  dispatch(playerId: string, payload: Record<string, unknown>): { kickedId?: string } {
    const s = this.state;
    const me = this.player(playerId);
    if (!me) throw new GameError("session-expired");
    me.lastSeen = this.opts.now();
    // أمر صادر من شاشة قديمة (نقرة مزدوجة أو تأخير شبكة) لا يُطبّق على مرحلة جديدة
    if (typeof payload.expectPhase === "string" && payload.expectPhase !== s.phase) throw new GameError("stale", true);
    if (typeof payload.expectSeq === "number" && payload.expectSeq !== (s.match?.seq ?? 0)) throw new GameError("stale", true);

    let kickedId: string | undefined;
    switch (payload.type) {
      case "settings":
        this.requireHost(me);
        this.updateSettings(payload.patch);
        break;
      case "profile":
        this.updateProfile(me, payload.name, payload.avatar);
        break;
      case "start":
        this.requireHost(me);
        this.requirePhase("lobby");
        this.startMatch();
        break;
      case "playAgain":
        this.requireHost(me);
        this.requirePhase("final");
        this.startMatch();
        break;
      case "kick": {
        this.requireHost(me);
        const target = this.player(str(payload.playerId));
        if (!target) throw new GameError("player-not-found");
        if (target.id === me.id) throw new GameError("cannot-kick-self");
        kickedId = target.id;
        this.removePlayer(target.id);
        break;
      }
      case "makeHost": {
        this.requireHost(me);
        const target = this.player(str(payload.playerId));
        if (!target || !target.connected) throw new GameError("player-not-found");
        s.hostId = target.id;
        s.hostOfflineSince = null;
        break;
      }
      case "pickTarget":
        this.pickTarget(me, str(payload.playerId));
        break;
      case "question":
        this.submitQuestion(me, payload.text);
        break;
      case "answer":
        this.submitAnswer(me, payload.text);
        break;
      case "forceInvestigation":
        this.requireHost(me);
        this.requirePhase("answering");
        this.forceInvestigation();
        break;
      case "eliminate":
        this.eliminate(me, str(payload.cardId));
        break;
      case "reveal":
        this.requestReveal(me);
        break;
      case "next":
        this.next(me);
        break;
      case "cancelRound":
        this.requireHost(me);
        this.requirePhase("pick", "announce", "question", "answering", "investigation");
        this.voidRound("host-cancelled");
        break;
      case "endMatch":
        this.requireHost(me);
        if (!s.match || s.phase === "final" || s.phase === "lobby") throw new GameError("wrong-phase");
        this.endMatch();
        break;
      case "toLobby":
        this.requireHost(me);
        this.toLobby();
        break;
      default:
        throw new GameError("invalid");
    }
    this.changed();
    return { kickedId };
  }

  private requireHost(me: Player) {
    if (this.state.hostId !== me.id) throw new GameError("not-host");
  }

  private requirePhase(...phases: Phase[]) {
    if (!phases.includes(this.state.phase)) throw new GameError("wrong-phase");
  }

  private setPhase(phase: Phase, ms: number | null) {
    const now = this.opts.now();
    this.state.phase = phase;
    this.state.phaseStartedAt = now;
    this.state.deadline = ms ? now + ms : null;
  }

  private secs(n: number): number | null {
    return n > 0 ? n * 1000 : null;
  }

  private updateSettings(raw: unknown) {
    if (!isPlainObject(raw)) throw new GameError("invalid");
    const s = this.state;
    const next: Settings = { ...s.settings };
    for (const [key, value] of Object.entries(raw)) {
      switch (key) {
        case "maxPlayers": {
          const n = int(value);
          if (n === null || n < MIN_PLAYERS || n > this.cap) throw new GameError("invalid");
          next.maxPlayers = Math.max(n, Math.min(s.players.length, this.cap));
          break;
        }
        case "language":
          if (value !== "ar" && value !== "en") throw new GameError("invalid");
          next.language = value;
          break;
        case "questionTime":
        case "answerTime":
        case "decisionTime": {
          const n = int(value);
          if (n === null || !(TIME_CHOICES[key] as readonly number[]).includes(n)) throw new GameError("invalid");
          next[key] = n;
          break;
        }
        case "roundMode":
          if (value !== "cycles" && value !== "fixed" && value !== "endless") throw new GameError("invalid");
          next.roundMode = value;
          break;
        case "roundCount": {
          const n = int(value);
          if (n === null || n < 1 || n > ROUND_LIMITS.fixed.max) throw new GameError("invalid");
          next.roundCount = n;
          break;
        }
        case "targetMode":
          if (value !== "random" && value !== "manual") throw new GameError("invalid");
          next.targetMode = value;
          break;
        case "scoring":
        case "sounds":
        case "streamerMode":
        case "locked":
          if (typeof value !== "boolean") throw new GameError("invalid");
          next[key] = value;
          break;
        default:
          throw new GameError("invalid");
      }
    }
    const lim = next.roundMode === "fixed" ? ROUND_LIMITS.fixed : ROUND_LIMITS.cycles;
    next.roundCount = Math.min(lim.max, Math.max(lim.min, next.roundCount));
    // تغيير مؤقت المرحلة الحالية يعيد ضبط مهلتها
    const timer = s.phase === "question" ? "questionTime" : s.phase === "answering" ? "answerTime" : s.phase === "investigation" ? "decisionTime" : null;
    if (timer && next[timer] !== s.settings[timer]) {
      const ms = this.secs(next[timer]);
      s.deadline = ms ? this.opts.now() + ms : null;
    }
    s.settings = next;
  }

  private updateProfile(me: Player, rawName: unknown, rawAvatar: unknown) {
    if (this.state.phase !== "lobby" && this.state.phase !== "final") throw new GameError("wrong-phase");
    if (rawName !== undefined) {
      const name = cleanText(rawName, LIMITS.name);
      if (!name) throw new GameError("name-required");
      if (this.nameOwner(name, me.id)) throw new GameError("name-taken");
      me.name = name;
    }
    if (rawAvatar !== undefined) {
      if (!isAvatar(rawAvatar)) throw new GameError("invalid");
      me.avatar = rawAvatar;
    }
  }

  // ---------- المباراة والجولات ----------

  private startMatch() {
    const s = this.state;
    if (this.connectedCount() < MIN_PLAYERS) throw new GameError("not-enough-players");
    shuffle(s.players, this.opts.rand).forEach((p, i) => {
      p.order = i + 1;
    });
    s.orderCounter = s.players.length;
    for (const p of s.players) {
      p.score = 0;
      p.stats = emptyStats();
      p.investigatorTurns = 0;
      p.targetTurns = 0;
    }
    s.matchCount++;
    s.match = { no: s.matchCount, seq: 0, completed: 0, lastInvestigatorOrder: 0, lastTargetId: null, pairs: [], usedQuestions: [] };
    s.history = [];
    s.final = null;
    s.round = null;
    this.beginRound();
  }

  private beginRound() {
    const s = this.state;
    const m = s.match!;
    const investigator = this.chooseInvestigator();
    if (!investigator) throw new GameError("not-enough-players");
    m.seq++;
    m.lastInvestigatorOrder = investigator.order;
    investigator.investigatorTurns++;
    s.round = {
      no: m.completed + 1,
      seq: m.seq,
      investigator: this.ref(investigator),
      target: null,
      question: null,
      autoQuestion: false,
      participants: [],
      dropped: [],
      answers: [],
      cards: null,
      eliminations: 0,
      result: null,
      voided: null,
    };
    if (s.settings.targetMode === "manual") this.setPhase("pick", null);
    else this.assignTarget(this.chooseTarget()!, TIMING.announceMs);
  }

  /** المحقق التالي: الأقل أدوارًا، وبالتساوي يكمل الدور بالترتيب بعد آخر محقق */
  private chooseInvestigator(): Player | null {
    const s = this.state;
    const online = this.connectedPlayers();
    if (online.length < MIN_PLAYERS) return null;
    const fewest = Math.min(...online.map((p) => p.investigatorTurns));
    const mod = s.orderCounter + 1;
    const last = s.match!.lastInvestigatorOrder;
    const distance = (p: Player) => (p.order - last - 1 + mod * 2) % mod;
    return online.filter((p) => p.investigatorTurns === fewest).sort((a, b) => distance(a) - distance(b))[0];
  }

  /** الشخص المطلوب عشوائيًا مع تقليل التكرار: الأقل استهدافًا، ثم من لم يستهدفه هذا المحقق، ثم غير آخر مطلوب */
  private chooseTarget(): Player | null {
    const s = this.state;
    const r = s.round!;
    const m = s.match!;
    const pool = this.answererPool();
    if (pool.length < 2) return null;
    const fewest = Math.min(...pool.map((p) => p.targetTurns));
    let best = pool.filter((p) => p.targetTurns === fewest);
    const fresh = best.filter((p) => !m.pairs.includes(`${r.investigator.id}>${p.id}`));
    if (fresh.length) best = fresh;
    const notLast = best.filter((p) => p.id !== m.lastTargetId);
    if (notLast.length) best = notLast;
    return best[this.opts.rand(best.length)];
  }

  private assignTarget(p: Player, announceMs: number) {
    const s = this.state;
    s.round!.target = this.ref(p);
    p.targetTurns++;
    s.match!.lastTargetId = p.id;
    this.setPhase("announce", announceMs);
  }

  private pickTarget(me: Player, id: string) {
    const s = this.state;
    this.requirePhase("pick");
    const r = s.round!;
    if (me.id !== r.investigator.id && me.id !== s.hostId) throw new GameError("not-investigator");
    const p = this.player(id);
    if (!p || p.id === r.investigator.id || !p.connected) throw new GameError("target-invalid");
    if (this.answererPool().length < 2) throw new GameError("not-enough-players");
    this.assignTarget(p, TIMING.announceShortMs);
  }

  /** الشخص المطلوب غادر أو غاب قبل نشر السؤال: نختار غيره ونعيد الإعلان */
  private reassignTarget() {
    const s = this.state;
    const r = s.round!;
    const old = this.player(r.target?.id);
    if (old) old.targetTurns = Math.max(0, old.targetTurns - 1);
    r.target = null;
    if (this.answererPool().length < 2) return this.voidRound("not-enough-players");
    if (s.settings.targetMode === "manual") return this.setPhase("pick", null);
    this.assignTarget(this.chooseTarget()!, TIMING.announceShortMs);
  }

  private submitQuestion(me: Player, raw: unknown) {
    this.requirePhase("question");
    const r = this.state.round!;
    if (me.id !== r.investigator.id) throw new GameError("not-investigator");
    const text = cleanText(raw, LIMITS.question);
    if (charLength(text) < MIN_QUESTION_LENGTH) throw new GameError("question-short");
    this.publishQuestion(text, false);
  }

  private autoQuestion() {
    const s = this.state;
    const m = s.match!;
    const bank = QUESTION_BANK[s.settings.language];
    let options = bank.map((_, i) => i).filter((i) => !m.usedQuestions.includes(i));
    if (!options.length) {
      m.usedQuestions = [];
      options = bank.map((_, i) => i);
    }
    const idx = options[this.opts.rand(options.length)];
    m.usedQuestions.push(idx);
    this.publishQuestion(bank[idx], true);
  }

  private publishQuestion(text: string, auto: boolean) {
    const s = this.state;
    const r = s.round!;
    r.question = text;
    r.autoQuestion = auto;
    r.participants = s.players.filter((p) => p.id !== r.investigator.id && (p.connected || p.id === r.target?.id)).map((p) => p.id);
    r.dropped = [];
    r.answers = [];
    this.setPhase("answering", this.secs(s.settings.answerTime));
    if (r.participants.length < 2) this.voidRound("not-enough-players");
  }

  private submitAnswer(me: Player, raw: unknown) {
    this.requirePhase("answering");
    const r = this.state.round!;
    if (me.id === r.investigator.id) throw new GameError("not-allowed");
    // إجابة واحدة فقط لكل لاعب، ولا تعديل بعد الإرسال
    if (this.hasAnswered(me.id)) throw new GameError("already-answered");
    const text = cleanText(raw, LIMITS.answer);
    if (!text) throw new GameError("answer-empty");
    r.answers.push({ author: this.ref(me), text, at: this.opts.now() });
    if (!r.participants.includes(me.id)) r.participants.push(me.id);
    r.dropped = r.dropped.filter((id) => id !== me.id);
    this.checkAnswers();
  }

  private hasAnswered(id: string | undefined): boolean {
    return !!id && !!this.state.round?.answers.some((a) => a.author.id === id);
  }

  private pendingAnswerers(): string[] {
    const r = this.state.round!;
    return r.participants.filter((id) => this.player(id) && !r.dropped.includes(id) && !this.hasAnswered(id));
  }

  private checkAnswers() {
    if (this.state.phase === "answering" && this.pendingAnswerers().length === 0) this.startInvestigation();
  }

  private forceInvestigation() {
    const r = this.state.round!;
    if (!this.hasAnswered(r.target?.id)) throw new GameError("target-not-answered");
    if (r.answers.length < 2) throw new GameError("not-enough-answers");
    this.startInvestigation();
  }

  private startInvestigation() {
    const s = this.state;
    const r = s.round!;
    if (!this.hasAnswered(r.target?.id)) return this.voidRound("target-missing");
    if (r.answers.length < 2) return this.voidRound("not-enough-answers");
    // خلط آمن ومعرّفات عشوائية جديدة، فلا يرتبط ترتيب البطاقات أو معرفاتها بترتيب الإرسال أو اللاعبين
    r.cards = shuffle(r.answers, this.opts.rand).map((a) => ({
      id: randomId(6),
      text: a.text,
      author: a.author,
      out: false,
      outAt: null,
      auto: false,
    }));
    r.eliminations = 0;
    this.setPhase("investigation", this.secs(s.settings.decisionTime));
  }

  private remaining(): number {
    return this.state.round?.cards?.filter((c) => !c.out).length ?? 0;
  }

  private eliminate(me: Player, cardId: string) {
    this.requirePhase("investigation");
    const r = this.state.round!;
    if (me.id !== r.investigator.id) throw new GameError("not-investigator");
    const card = r.cards!.find((c) => c.id === cardId);
    if (!card || card.out) throw new GameError("card-invalid");
    if (this.remaining() <= 1) throw new GameError("last-card");
    this.eliminateCard(card, false);
  }

  /** الاستبعاد لا يخبر أحدًا هل كانت البطاقة للشخص المطلوب أم لا */
  private eliminateCard(card: Card, auto: boolean) {
    const s = this.state;
    card.out = true;
    card.outAt = ++s.round!.eliminations;
    card.auto = auto;
    const ms = this.secs(s.settings.decisionTime);
    s.deadline = ms ? this.opts.now() + ms : null;
  }

  private requestReveal(me: Player) {
    this.requirePhase("investigation");
    const r = this.state.round!;
    if (me.id !== r.investigator.id) throw new GameError("not-investigator");
    if (this.remaining() !== 1) throw new GameError("need-one-card");
    this.setPhase("countdown", TIMING.countdownMs);
  }

  private finishRound() {
    const s = this.state;
    const r = s.round!;
    const m = s.match!;
    const cards = r.cards!;
    const target = r.target!;
    const last = cards.find((c) => !c.out)!;
    const targetCard = cards.find((c) => c.author.id === target.id)!;
    const won = last.id === targetCard.id;
    const pts = (n: number) => (s.settings.scoring ? n : 0);
    const awards: Award[] = won
      ? [{ player: r.investigator, kind: "found", points: pts(POINTS.found) }]
      : [
          { player: target, kind: "escaped", points: pts(POINTS.escaped) },
          { player: last.author, kind: "fooled", points: pts(POINTS.fooled) },
        ];
    const inv = this.player(r.investigator.id);
    if (inv) {
      inv.stats.investigated++;
      if (won) inv.stats.found++;
    }
    const tgt = this.player(target.id);
    if (tgt) {
      tgt.stats.targeted++;
      if (!won) tgt.stats.escaped++;
    }
    if (!won) {
      const fooler = this.player(last.author.id);
      if (fooler) fooler.stats.fooled++;
    }
    for (const a of awards) {
      const p = this.player(a.player.id);
      if (p) p.score += a.points;
    }
    r.result = { lastCardId: last.id, targetCardId: targetCard.id, won, awards };
    m.completed++;
    m.pairs.push(`${r.investigator.id}>${target.id}`);
    s.history.push({
      no: r.no,
      question: r.question ?? "",
      investigator: r.investigator,
      target,
      lastAuthor: last.author,
      won,
      targetOutAt: targetCard.outAt,
      cardCount: cards.length,
    });
    if (s.history.length > 60) s.history.shift();
    this.setPhase("reveal", null);
  }

  private next(me: Player) {
    const s = this.state;
    this.requirePhase("reveal");
    if (me.id !== s.hostId && me.id !== s.round?.investigator.id) throw new GameError("not-allowed");
    this.advance();
  }

  private advance() {
    if (this.matchShouldEnd()) return this.endMatch();
    this.beginRound();
  }

  private matchShouldEnd(): boolean {
    const s = this.state;
    const m = s.match;
    if (!m) return false;
    if (s.settings.roundMode === "fixed") return m.completed >= s.settings.roundCount;
    if (s.settings.roundMode === "cycles") {
      const online = this.connectedPlayers();
      return online.length > 0 && online.every((p) => p.investigatorTurns >= s.settings.roundCount);
    }
    return false;
  }

  private voidRound(reason: VoidReason) {
    const s = this.state;
    const r = s.round!;
    r.voided = reason;
    // الجولة الملغاة لا تُحسب دورًا على المحقق ولا على الشخص المطلوب
    const inv = this.player(r.investigator.id);
    if (inv) inv.investigatorTurns = Math.max(0, inv.investigatorTurns - 1);
    const tgt = this.player(r.target?.id);
    if (tgt) tgt.targetTurns = Math.max(0, tgt.targetTurns - 1);
    // لا نكشف أي إجابة من جولة ملغاة
    r.answers = [];
    r.cards = null;
    this.setPhase("reveal", TIMING.voidNextMs);
  }

  private endMatch() {
    const s = this.state;
    if (s.round && ROUND_PHASES.includes(s.phase)) this.voidRound("host-cancelled");
    s.final = this.computeFinal();
    this.setPhase("final", null);
  }

  private toLobby() {
    const s = this.state;
    if (s.phase === "lobby") throw new GameError("wrong-phase");
    s.match = null;
    s.round = null;
    s.final = null;
    s.history = [];
    for (const p of s.players) {
      p.investigatorTurns = 0;
      p.targetTurns = 0;
    }
    this.setPhase("lobby", null);
  }

  private computeFinal(): FinalView {
    const s = this.state;
    const sorted = [...s.players].sort(
      (a, b) => b.score - a.score || b.stats.found - a.stats.found || b.stats.fooled - a.stats.fooled || a.joinedAt - b.joinedAt,
    );
    let rank = 0;
    let prev: number | null = null;
    const standings: Standing[] = sorted.map((p, i) => {
      if (p.score !== prev) {
        rank = i + 1;
        prev = p.score;
      }
      return { player: this.ref(p), score: p.score, stats: { ...p.stats }, rank };
    });
    const titles: Title[] = [];
    const award = (kind: TitleKind, value: (p: Player) => number, tie: (p: Player) => number) => {
      const best = s.players.filter((p) => value(p) > 0).sort((a, b) => value(b) - value(a) || tie(b) - tie(a))[0];
      if (best) titles.push({ kind, player: this.ref(best), value: value(best) });
    };
    const ratio = (a: number, b: number) => a / Math.max(1, b);
    award("detective", (p) => p.stats.found, (p) => ratio(p.stats.found, p.stats.investigated));
    award("trickster", (p) => p.stats.fooled, (p) => p.stats.escaped);
    award("ghost", (p) => p.stats.escaped, (p) => ratio(p.stats.escaped, p.stats.targeted));
    award("openBook", (p) => p.stats.targeted - p.stats.escaped, (p) => ratio(p.stats.targeted - p.stats.escaped, p.stats.targeted));
    return { standings, titles, rounds: s.match?.completed ?? 0 };
  }

  // ---------- المؤقتات والغياب ----------

  /** يُستدعى دوريًا من الخادم (عدة مرات في الثانية) */
  tick() {
    const s = this.state;
    const now = this.opts.now();
    let dirty = false;
    if (s.hostId && s.hostOfflineSince !== null && now - s.hostOfflineSince > TIMING.hostGraceMs) {
      const next = this.connectedPlayers().sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) {
        s.hostId = next.id;
        s.hostOfflineSince = null;
        dirty = true;
      }
    }
    if (s.deadline !== null && now >= s.deadline) {
      this.onDeadline();
      dirty = true;
    }
    if (this.checkAbsences(now)) dirty = true;
    if (dirty) this.changed();
  }

  private onDeadline() {
    const s = this.state;
    const r = s.round;
    switch (s.phase) {
      case "announce":
        this.setPhase("question", this.secs(s.settings.questionTime));
        return;
      case "question":
        // انتهى وقت المحقق: سؤال جاهز من البنك
        this.autoQuestion();
        return;
      case "answering":
        this.startInvestigation();
        return;
      case "investigation": {
        const live = r!.cards!.filter((c) => !c.out);
        if (live.length > 1) this.eliminateCard(live[this.opts.rand(live.length)], true);
        else this.setPhase("countdown", TIMING.countdownMs);
        return;
      }
      case "countdown":
        this.finishRound();
        return;
      case "reveal":
        s.deadline = null;
        if (r?.voided) {
          try {
            this.advance();
          } catch {
            // ما فيه لاعبين كفاية: ننتظر صاحب الغرفة
          }
        }
        return;
      default:
        s.deadline = null;
    }
  }

  private checkAbsences(now: number): boolean {
    const s = this.state;
    const r = s.round;
    if (!r) return false;
    const away = (id: string | undefined, ms: number) => {
      const p = this.player(id);
      return !!p && !p.connected && p.offlineSince !== null && now - p.offlineSince > ms;
    };
    switch (s.phase) {
      case "pick":
      case "announce":
      case "question":
      case "investigation":
        if (away(r.investigator.id, TIMING.investigatorGraceMs)) {
          this.voidRound("investigator-away");
          return true;
        }
        if ((s.phase === "announce" || s.phase === "question") && away(r.target?.id, TIMING.targetGraceMs)) {
          this.reassignTarget();
          return true;
        }
        return false;
      case "answering": {
        if (!this.hasAnswered(r.target?.id) && away(r.target?.id, TIMING.targetGraceMs)) {
          this.voidRound("target-missing");
          return true;
        }
        const late = this.pendingAnswerers().filter((id) => id !== r.target?.id && away(id, TIMING.answererGraceMs));
        if (!late.length) return false;
        r.dropped.push(...late);
        this.checkAnswers();
        return true;
      }
      default:
        return false;
    }
  }

  // ---------- ما يراه كل لاعب ----------

  private roleOf(id: string): RoundRole {
    const s = this.state;
    const r = s.round!;
    if (r.investigator.id === id) return "investigator";
    if (r.target?.id === id) return "target";
    if (s.phase === "pick" || s.phase === "announce" || s.phase === "question" || s.phase === "answering") return "answerer";
    return r.answers.some((a) => a.author.id === id) ? "answerer" : "spectator";
  }

  private matchView(): MatchView {
    const s = this.state;
    const m = s.match!;
    let total: number | null = null;
    if (s.settings.roundMode === "fixed") total = s.settings.roundCount;
    else if (s.settings.roundMode === "cycles") {
      const inProgress = s.round && ROUND_PHASES.includes(s.phase) ? 1 : 0;
      total = m.completed + inProgress + s.players.reduce((n, p) => n + Math.max(0, s.settings.roundCount - p.investigatorTurns), 0);
    }
    return { no: m.no, seq: m.seq, completed: m.completed, total, isLast: s.phase === "reveal" && this.matchShouldEnd() };
  }

  private roundView(viewerId: string | null): RoundView {
    const s = this.state;
    const r = s.round!;
    const cards: CardView[] | null =
      r.cards && CARD_PHASES.includes(s.phase)
        ? r.cards.map((c, i) => ({
            id: c.id,
            n: i + 1,
            text: c.text,
            out: c.out,
            outAt: c.outAt,
            auto: c.auto,
            mine: viewerId !== null && c.author.id === viewerId,
          }))
        : null;
    // أصحاب البطاقات لا يُرسلون إلا بعد انتهاء العد التنازلي
    let reveal: RevealView | null = null;
    if (s.phase === "reveal" && r.result && r.cards && cards) {
      reveal = {
        cards: r.cards.map((c, i) => ({ ...cards[i], author: c.author, isTarget: c.author.id === r.target?.id })),
        lastCardId: r.result.lastCardId,
        targetCardId: r.result.targetCardId,
        investigatorWon: r.result.won,
        awards: r.result.awards,
      };
    }
    return {
      no: r.no,
      investigator: r.investigator,
      target: r.target,
      question: r.question,
      autoQuestion: r.autoQuestion,
      participantIds: r.participants.filter((id) => !r.dropped.includes(id)),
      answeredIds: r.answers.map((a) => a.author.id),
      myAnswer: viewerId ? (r.answers.find((a) => a.author.id === viewerId)?.text ?? null) : null,
      cards,
      remaining: cards ? cards.filter((c) => !c.out).length : 0,
      reveal,
      voided: r.voided,
    };
  }

  /** الحالة كما يراها لاعب معيّن (أو شاشة البث إذا viewerId = null) */
  buildView(viewerId: string | null): RoomView {
    const s = this.state;
    const viewer = this.player(viewerId);
    const inRound = !!s.round && (ROUND_PHASES.includes(s.phase) || s.phase === "reveal");
    const players: PublicPlayer[] = s.players.map((p) => ({
      ...this.ref(p),
      connected: p.connected,
      isHost: p.id === s.hostId,
      score: p.score,
      stats: { ...p.stats },
      role: inRound ? this.roleOf(p.id) : null,
      answered: inRound && s.phase === "answering" && this.hasAnswered(p.id),
    }));
    return {
      code: s.code,
      serverNow: this.opts.now(),
      version: s.version,
      me: viewer ? { id: viewer.id, isHost: viewer.id === s.hostId } : null,
      hostId: s.hostId,
      phase: s.phase,
      phaseStartedAt: s.phaseStartedAt,
      deadline: s.deadline,
      settings: { ...s.settings },
      players,
      match: s.match ? this.matchView() : null,
      round: inRound ? this.roundView(viewer?.id ?? null) : null,
      history: s.history,
      final: s.phase === "final" ? s.final : null,
    };
  }
}
