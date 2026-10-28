// أنواع البيانات المشتركة بين الخادم والواجهة. كل ما يصل للمتصفح يمر عبر RoomView،
// ولا يحتوي على صاحب أي إجابة قبل مرحلة الكشف.

export type Lang = "ar" | "en";

export type Phase =
  | "lobby"
  | "pick" // اختيار الشخص المطلوب يدويًا
  | "announce" // إعلان المحقق والشخص المطلوب
  | "question" // المحقق يكتب السؤال
  | "answering" // البقية يكتبون إجاباتهم سرًا
  | "investigation" // المحقق يستبعد البطاقات
  | "countdown" // العد التنازلي قبل الكشف
  | "reveal" // كشف الهويات والنتيجة (أو جولة ملغاة)
  | "final"; // نهاية المباراة

export type RoundMode = "cycles" | "fixed" | "endless";
export type TargetMode = "random" | "manual";

export interface Settings {
  maxPlayers: number;
  language: Lang;
  /** بالثواني، 0 = مفتوح */
  questionTime: number;
  answerTime: number;
  /** مهلة كل قرار استبعاد */
  decisionTime: number;
  roundMode: RoundMode;
  /** عدد الدورات (cycles) أو عدد الجولات (fixed) */
  roundCount: number;
  targetMode: TargetMode;
  scoring: boolean;
  sounds: boolean;
  /** وضع البث: إخفاء أسماء اللاعبين على الشاشة أثناء التحقيق */
  streamerMode: boolean;
  locked: boolean;
}

export interface PlayerStats {
  /** جولات مكتملة كمحقق */
  investigated: number;
  /** مرات كشف فيها الشخص المطلوب */
  found: number;
  /** مرات كان فيها الشخص المطلوب */
  targeted: number;
  /** مرات نجا فيها كشخص مطلوب */
  escaped: number;
  /** مرات بقيت بطاقته للنهاية وهو مو المطلوب */
  fooled: number;
}

export type RoundRole = "investigator" | "target" | "answerer" | "spectator";

export interface PersonRef {
  id: string;
  name: string;
  avatar: string;
  color: number;
}

export interface PublicPlayer extends PersonRef {
  connected: boolean;
  isHost: boolean;
  score: number;
  stats: PlayerStats;
  role: RoundRole | null;
  answered: boolean;
}

export interface CardView {
  id: string;
  /** رقم البطاقة كما يظهر (1..N) بعد الخلط */
  n: number;
  text: string;
  out: boolean;
  /** ترتيب الاستبعاد */
  outAt: number | null;
  /** استُبعدت تلقائيًا لانتهاء الوقت */
  auto: boolean;
  /** بطاقة المشاهد نفسه (تُرسل له وحده) */
  mine: boolean;
}

export interface RevealCard extends CardView {
  author: PersonRef;
  isTarget: boolean;
}

export type AwardKind = "found" | "escaped" | "fooled";

export interface Award {
  player: PersonRef;
  kind: AwardKind;
  points: number;
}

export interface RevealView {
  cards: RevealCard[];
  lastCardId: string;
  targetCardId: string;
  investigatorWon: boolean;
  awards: Award[];
}

export type VoidReason =
  | "host-cancelled"
  | "investigator-left"
  | "investigator-away"
  | "target-left"
  | "target-missing"
  | "not-enough-answers"
  | "not-enough-players";

export interface RoundView {
  no: number;
  investigator: PersonRef;
  target: PersonRef | null;
  question: string | null;
  autoQuestion: boolean;
  /** اللاعبون المطلوب منهم الإجابة */
  participantIds: string[];
  answeredIds: string[];
  /** إجابة المشاهد نفسه فقط */
  myAnswer: string | null;
  cards: CardView[] | null;
  remaining: number;
  reveal: RevealView | null;
  voided: VoidReason | null;
}

export interface MatchView {
  no: number;
  /** رقم تسلسلي لكل جولة تبدأ (يُستخدم لمنع الأوامر القديمة) */
  seq: number;
  completed: number;
  total: number | null;
  isLast: boolean;
}

export interface RoundSummary {
  no: number;
  question: string;
  investigator: PersonRef;
  target: PersonRef;
  lastAuthor: PersonRef;
  won: boolean;
  /** متى استُبعدت بطاقة الشخص المطلوب (null إذا بقيت للنهاية) */
  targetOutAt: number | null;
  cardCount: number;
}

export type TitleKind = "detective" | "trickster" | "ghost" | "openBook";

export interface Title {
  kind: TitleKind;
  player: PersonRef;
  value: number;
}

export interface Standing {
  player: PersonRef;
  score: number;
  stats: PlayerStats;
  rank: number;
}

export interface FinalView {
  standings: Standing[];
  titles: Title[];
  rounds: number;
}

export interface RoomView {
  code: string;
  serverNow: number;
  version: number;
  me: { id: string; isHost: boolean } | null;
  hostId: string | null;
  phase: Phase;
  phaseStartedAt: number;
  deadline: number | null;
  settings: Settings;
  players: PublicPlayer[];
  match: MatchView | null;
  round: RoundView | null;
  history: RoundSummary[];
  final: FinalView | null;
}

export type GameAction =
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "profile"; name?: string; avatar?: string }
  | { type: "start" }
  | { type: "kick"; playerId: string }
  | { type: "makeHost"; playerId: string }
  | { type: "pickTarget"; playerId: string }
  | { type: "question"; text: string }
  | { type: "answer"; text: string }
  | { type: "forceInvestigation" }
  | { type: "eliminate"; cardId: string }
  | { type: "reveal" }
  | { type: "next" }
  | { type: "cancelRound" }
  | { type: "endMatch" }
  | { type: "playAgain" }
  | { type: "toLobby" };

export type ActionEnvelope = GameAction & { expectPhase?: Phase; expectSeq?: number };

export type ErrorCode =
  | "room-not-found"
  | "session-expired"
  | "room-full"
  | "room-locked"
  | "name-required"
  | "name-taken"
  | "not-host"
  | "not-investigator"
  | "not-allowed"
  | "wrong-phase"
  | "stale"
  | "not-enough-players"
  | "invalid"
  | "question-short"
  | "answer-empty"
  | "already-answered"
  | "card-invalid"
  | "last-card"
  | "need-one-card"
  | "target-invalid"
  | "target-not-answered"
  | "not-enough-answers"
  | "cannot-kick-self"
  | "player-not-found"
  | "rate-limited"
  | "too-many-rooms"
  | "server-busy"
  | "no-connection"
  | "unknown";

export type AckResult<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode; quiet?: boolean };

export interface JoinResult {
  code: string;
  token: string;
  playerId: string;
}

export interface PeekResult {
  exists: boolean;
  phase?: Phase;
  locked?: boolean;
  full?: boolean;
  language?: Lang;
  players?: number;
  resumable?: { name: string; avatar: string } | null;
}

export interface ReactionEvent {
  id: string;
  playerId: string | null;
  emoji: string;
}
