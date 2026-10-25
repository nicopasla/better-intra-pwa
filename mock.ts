import type { StudentEntry, UserProfile } from "./data.ts";
import { catImage } from "./lib/cat-images.ts";

export const mockMode =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).has("mock") ||
    import.meta.env?.VITE_MOCK === "1");

const now = Date.now();
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local wall-clock ISO (no timezone) so the 24h mock times render exactly. */
function mins(m: number): string {
  const d = new Date(now + m * 60000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Stable small hash so mock profiles/logtime are deterministic per login. */
function mockHash(login: string): number {
  let hash = 0;
  for (const ch of login.toLowerCase())
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

const MOCK_NAMES: Record<string, string> = {
  "mock.user": "Mock User",
  jsmith: "Jane Smith",
  amelie: "Amélie Martin",
  bdurand: "Bob Durand",
  cpetit: "Charlie Petit",
  dleroy: "Diana Leroy",
  vmoreau: "Victor Moreau",
};

/** Mock profile used by the in-app user profile view (`?mock`). */
function mockProfile(login: string): UserProfile {
  const l = login.trim().toLowerCase();
  const hash = mockHash(l);
  const isSelf = l === "mock.user";
  const name = MOCK_NAMES[l] ?? l.charAt(0).toUpperCase() + l.slice(1);
  const customAvatar =
    isSelf || l === "bdurand" ? catImage(isSelf ? 36 : 37) : null;
  return {
    login: l,
    displayName: name,
    usualFullName: name,
    avatar: catImage(hash % 100000),
    kind: "student",
    staff: false,
    alumni: l === "dleroy",
    active: l !== "cpetit",
    memberSince: new Date(now - 420 * 86400000).toISOString(),
    alumnizedAt:
      l === "dleroy" ? new Date(now - 90 * 86400000).toISOString() : null,
    wallet: 200 + (hash % 3000),
    correctionPoints: hash % 40,
    level: Number(((hash % 1800) / 100).toFixed(2)),
    grade: hash % 3 === 0 ? "Cadet" : "Member",
    location:
      l === "amelie" || l === "bdurand"
        ? "fu-c1-p1"
        : hash % 2 === 0
          ? "fu-r2-p3"
          : null,
    campusId: 12,
    campusName: "Belgium",
    poolMonth: "february",
    poolYear: "2024",
    poolLabel: "02/2024",
    groups: [
      { name: "Nebula", color: "#00babc" },
      { name: "Comet", color: "#0099ff" },
    ],
    cursus: {
      name: "42cursus",
      slug: "42cursus",
      kind: "main",
      beginAt: new Date(now - 400 * 86400000).toISOString(),
      endAt: null,
    },
    blackholedAt:
      l === "cpetit"
        ? new Date(now - 20 * 86400000).toISOString()
        : new Date(now + 120 * 86400000).toISOString(),
    projects: {
      total: 24,
      validated: 18,
      failed: 3,
      inProgress: 2,
      active: [
        { id: 1, name: "Fly-in", slug: "fly-in", occurrence: 1 },
        {
          id: 2,
          name: "Python Module 10",
          slug: "python-module-10",
          occurrence: 0,
        },
      ],
      recent: [
        {
          id: 101,
          name: "Born2beroot",
          slug: "42next-born2beroot",
          occurrence: 2,
          finalMark: 100,
          validated: true,
          markedAt: new Date(now - 3 * 86400000).toISOString(),
        },
        {
          id: 102,
          name: "Libft",
          slug: "libft",
          occurrence: 0,
          finalMark: 42,
          validated: false,
          markedAt: new Date(now - 12 * 86400000).toISOString(),
        },
      ],
    },
    visuals: {
      profileColor: "#00BCBA",
      customAvatar,
      avatarBg: customAvatar ? "#0f766e" : "transparent",
      avatarPosX: 50,
      avatarPosY: 40,
      avatarScale: 120,
      banner: null,
      bannerMode: "fill",
      bannerColor: null,
      background: isSelf ? catImage(35) : null,
      backgroundMode: "fill",
      backgroundColor: null,
    },
    logtime: {
      goalHours: 140,
      showAverage: true,
      showGoal: true,
      showTacos: true,
      showTotalTacos: false,
      showStreak: true,
      emoji: "🌮",
      divisor: 8.7,
      rate: 2,
      maxEarnings: 500,
      showDaysMode: "date",
      calendarColor: "#00BCBA",
      labelsColor: "#26a641",
      rainbowPalette: "rainbow",
      calendarView: "normal",
      fontScale: 100,
      disableAnimations: false,
    },
  };
}

/** Mock logtime: seconds per day for roughly a year, weekends quieter. */
function mockLogtimeDays(login: string): Record<string, number> {
  const hash = mockHash(login);
  const days: Record<string, number> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 900; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const weekday = d.getDay();
    const weekend = weekday === 0 || weekday === 6;
    if ((hash + i) % (weekend ? 3 : 11) === 0) continue;
    const base = weekend ? 3600 : 3600 * 4;
    days[key] = base + ((hash + i * 37) % 4) * 3600 + ((hash + i) % 60) * 60;
  }
  return days;
}

export const mock = {
  me: {
    login: "jsmith",
    displayName: "Jane Smith",
    usualFullName: "Jane Smith",
    image: catImage(1),
    kind: "student",
    staff: false,
    alumni: false,
    active: true,
    memberSince: "2024-01-30T13:30:43.828Z",
    wallet: 1234,
    correctionPoints: 42,
    level: 8.47,
    grade: "Cadet",
    location: "fu-r2-p3",
    campusId: 12,
    campusName: "Belgium",
    poolMonth: "february",
    poolYear: "2026",
    poolLabel: "02/2026",
    groups: [
      { name: "Nebula", color: "#6000bc" },
      { name: "Quasar", color: "#f99e3b" },
      { name: "Pulsar", color: "#0099ff" },
      { name: "Vortex", color: "#2e9e5b" },
      { name: "Photon", color: "#c98a2b" },
      { name: "Comet", color: "#00babc" },
      { name: "Orbit", color: null },
      { name: "Cosmos", color: null },
    ],
    cursus: {
      name: "42cursus",
      slug: "42cursus",
      kind: "main",
      beginAt: "2024-04-13T09:30:00.000Z",
      endAt: null,
    },
    blackholedAt: new Date(now + 120 * 86400000).toISOString(),
    projects: {
      total: 24,
      validated: 18,
      failed: 3,
      inProgress: 2,
      active: [
        { id: 1, name: "Fly-in", slug: "fly-in", occurrence: 1 },
        {
          id: 2,
          name: "Python Module 10",
          slug: "python-module-10",
          occurrence: 0,
        },
      ],
      recent: [
        {
          id: 101,
          name: "Born2beroot",
          slug: "42next-born2beroot",
          occurrence: 2,
          finalMark: 100,
          validated: true,
          markedAt: new Date(now - 3 * 86400000).toISOString(),
          outstanding: 3,
        },
        {
          id: 102,
          name: "A-Maze-ing",
          slug: "a-maze-ing",
          occurrence: 0,
          finalMark: 125,
          validated: true,
          markedAt: new Date(now - 10 * 86400000).toISOString(),
          outstanding: 1,
        },
        {
          id: 103,
          name: "Fly-in",
          slug: "fly-in",
          occurrence: 1,
          finalMark: 0,
          validated: false,
          markedAt: new Date(now - 1 * 86400000).toISOString(),
          outstanding: 0,
        },
      ],
    },
    achievements: [
      {
        name: "Welcome, Cadet !",
        description: "You have passed the C Piscine! Welcome to 42!",
        tier: "none",
        kind: "project",
        nbrOfSuccess: null,
        image: "https://cdn.intra.42.fr/achievement/image/1/PRO001.svg",
      },
      {
        name: "Bonus Hunter",
        description: "Validated 3 projects with the maximum score.",
        tier: "medium",
        kind: "project",
        nbrOfSuccess: 3,
        image: "https://cdn.intra.42.fr/achievement/image/18/PRO005.svg",
      },
      {
        name: "It's a rich man's world",
        description: "Collected 100 wallet points.",
        tier: "none",
        kind: "social",
        nbrOfSuccess: 100,
        image: "https://cdn.intra.42.fr/achievement/image/36/SOC004.svg",
      },
    ],
    achievementsCount: 3,
    customAvatar: null,
    avatarBg: "transparent",
    avatarPosX: 50,
    avatarPosY: 50,
    avatarScale: 100,
  },
  upcoming: {
    tracked: true,
    items: [
      {
        id: 4,
        // Names + project are revealed 15 min before the slot.
        beginAt: mins(15),
        state: "revealed" as const,
        project: "Libft",
        slug: "42cursus-libft",
        role: "evaluator" as const,
        correcteds: ["marvin"],
      },
      {
        id: 1,
        beginAt: mins(15),
        state: "revealed" as const,
        project: "get_next_line",
        slug: "get_next_line",
        role: "evaluator" as const,
        correcteds: ["jdoe"],
      },
      {
        // Booked: project isn't revealed yet.
        id: 2,
        beginAt: mins(3 * 60),
        state: "booked" as const,
        project: null,
        slug: null,
        role: "evaluator" as const,
      },
      {
        // Someone is evaluating you; the evaluator is revealed 15 min before.
        id: 5,
        beginAt: mins(15),
        state: "revealed" as const,
        project: "push_swap",
        slug: "push_swap",
        role: "corrected" as const,
        corrector: "amelie",
      },
      {
        id: 6,
        beginAt: mins(26 * 60),
        state: "booked" as const,
        project: "Born2beroot",
        slug: "born2beroot",
        role: "corrected" as const,
        corrector: null,
      },
    ],
  },
  profileStats: {
    roulette: {
      entries: [
        {
          historic_id: 101,
          sum: 2,
          total: 3,
          created_at: new Date(now - 86400000).toISOString(),
        },
        {
          historic_id: 102,
          sum: 1,
          total: 3,
          created_at: new Date(now - 3 * 86400000).toISOString(),
        },
        {
          historic_id: 103,
          sum: 1,
          total: 2,
          created_at: new Date(now - 5 * 86400000).toISOString(),
        },
        {
          historic_id: 104,
          sum: 3,
          total: 3,
          created_at: new Date(now - 8 * 86400000).toISOString(),
        },
        {
          historic_id: 105,
          sum: 1,
          total: 2,
          created_at: new Date(now - 11 * 86400000).toISOString(),
        },
        {
          historic_id: 106,
          sum: 2,
          total: 3,
          created_at: new Date(now - 15 * 86400000).toISOString(),
        },
        {
          historic_id: 107,
          sum: 2,
          total: 2,
          created_at: new Date(now - 19 * 86400000).toISOString(),
        },
        {
          historic_id: 108,
          sum: 1,
          total: 3,
          created_at: new Date(now - 24 * 86400000).toISOString(),
        },
        {
          historic_id: 109,
          sum: 3,
          total: 4,
          created_at: new Date(now - 30 * 86400000).toISOString(),
        },
        {
          historic_id: 110,
          sum: 1,
          total: 2,
          created_at: new Date(now - 36 * 86400000).toISOString(),
        },
      ],
    },
    evalStats: {
      global: { total: 68, failed: 8, successPercentage: 88.2 },
      byMonth: {
        "2026-10": { total: 1, failed: 1, successPercentage: 0 },
        "2026-09": { total: 10, failed: 0, successPercentage: 100 },
        "2026-08": { total: 3, failed: 2, successPercentage: 33.3 },
        "2026-07": { total: 16, failed: 1, successPercentage: 93.8 },
        "2026-06": { total: 11, failed: 2, successPercentage: 81.8 },
        "2026-05": { total: 19, failed: 2, successPercentage: 89.5 },
        "2026-04": { total: 7, failed: 1, successPercentage: 85.7 },
        "2026-03": { total: 12, failed: 2, successPercentage: 83.3 },
        "2026-02": { total: 18, failed: 3, successPercentage: 83.3 },
        "2026-01": { total: 9, failed: 0, successPercentage: 100 },
        "2025-12": { total: 5, failed: 1, successPercentage: 80 },
        "2025-11": { total: 8, failed: 2, successPercentage: 75 },
      },
    },
  },
  userLookup: (login: string) => {
    const l = login.toLowerCase();
    let hash = 0;
    for (const ch of l) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const fullNames: Record<string, string> = {
      marvin: "Marvin Martian",
      jdoe: "John Doe",
    };
    return {
      login: l,
      displayName: fullNames[l] ?? l.charAt(0).toUpperCase() + l.slice(1),
      avatar: catImage(hash % 100000),
      level: Number(((hash % 1800) / 100).toFixed(2)),
      grade: "Cadet",
      location:
        l === "amelie" || l === "bdurand"
          ? "fu-c1-p1"
          : hash % 2 === 0
            ? "fu-r2-p3"
            : null,
    };
  },
  userProfile: (login: string): UserProfile => mockProfile(login),
  logtime: (login: string) => ({ days: mockLogtimeDays(login) }),
  outstanding: { 101: 3, 102: 1 } as Record<number, number>,
  friends: [
    {
      login: "amelie",
      displayName: "Amélie Martin",
      avatar: catImage(2),
      customAvatar: null,
      avatarBg: "transparent",
      avatarPosX: 50,
      avatarPosY: 50,
      avatarScale: 100,
      level: 14.32,
      grade: "Member at 42cursus",
      isOnline: true,
      lastSeen: "fu-c1-p1",
      poolLabel: "06/2001",
      wallet: 2100,
      correctionPoints: 12,
      lastOnlineTimestamp: null,
    },
    {
      login: "bdurand",
      displayName: "Bob Durand",
      avatar: catImage(3),
      customAvatar: catImage(4),
      avatarBg: "#5b21b6",
      avatarPosX: 60,
      avatarPosY: 40,
      avatarScale: 130,
      level: 7.9,
      grade: "Learner",
      isOnline: true,
      lastSeen: "fu-c2-p2",
      poolLabel: null,
      wallet: 842,
      correctionPoints: 3,
      lastOnlineTimestamp: null,
    },
    {
      login: "cpetit",
      displayName: "Charlie Petit",
      avatar: catImage(5),
      customAvatar: null,
      avatarBg: "transparent",
      avatarPosX: 50,
      avatarPosY: 50,
      avatarScale: 100,
      level: 3.42,
      grade: null,
      isOnline: false,
      lastSeen: null,
      poolLabel: "12/2004",
      wallet: 150,
      correctionPoints: 0,
      lastOnlineTimestamp: now - 2 * 3600 * 1000,
    },
    {
      login: "dleroy",
      displayName: "Diana Leroy",
      avatar: catImage(6),
      customAvatar: null,
      avatarBg: "transparent",
      avatarPosX: 50,
      avatarPosY: 50,
      avatarScale: 100,
      level: 21.05,
      grade: "Member",
      isOnline: false,
      lastSeen: null,
      poolLabel: null,
      wallet: 3500,
      correctionPoints: 21,
      lastOnlineTimestamp: now - 86400000,
    },
    {
      login: "vmoreau",
      displayName: "Victor Moreau",
      avatar: catImage(7),
      customAvatar: null,
      avatarBg: "transparent",
      avatarPosX: 50,
      avatarPosY: 50,
      avatarScale: 100,
      level: 5.67,
      grade: "Member",
      isOnline: true,
      lastSeen: "fu-c3-p1",
      poolLabel: "06/2001",
      wallet: 5,
      correctionPoints: 1,
      lastOnlineTimestamp: null,
    },
  ],
  blob: {
    settings: {
      FRIENDS_LIST: ["amelie", "bdurand", "cpetit", "dleroy", "vmoreau"],
      SHOW_CUSTOM_AVATARS_IN_FRIENDS: true,
      PROFILE_USE_CUSTOM_COLOR: true,
      LOGTIME_CALENDAR_COLOR: "#00BCBA",
    },
    revision: "mock",
  },
  sessions: {
    max: 20,
    sessions: [
      {
        id: "1",
        label: "Safari · iOS 27",
        name: "Blue Fox",
        current: true,
        createdAt: now - 3600 * 1000,
        lastUsedAt: now - 30 * 1000,
      },
      {
        id: "2",
        label: "Firefox 131",
        current: false,
        createdAt: now - 3 * 86400000,
        lastUsedAt: now - 2 * 3600 * 1000,
      },
    ],
  },
  events: [
    {
      id: 101,
      name: "🎓 Alumni Fireside Chat #20 with Antoine @Google Cloud and friends",
      beginAt: mins(5 * 24 * 60),
      endAt: mins(5 * 24 * 60 + 60),
      location: "Amphithéâtre",
      description:
        "Unsure what comes after 42? Get your answers from two 42 Alumni at the next Fireside Chat.\n\n• Antoine — 42 Paris, Senior Software Engineer @ Google Cloud\n• Mounia — 1337 Benguerir, Data Scientist @ CRSA\n\nJourneys, career choices, relocation, life after 42… Come ask your questions!",
      subscribers: 803,
      maxSubscribers: 1000,
      url: "https://events.intra.42.fr/events/101",
    },
    {
      id: 102,
      name: "⚙️ 42 Workspace: Docker for beginners",
      beginAt: mins(-20),
      endAt: mins(100),
      location: "Room 4.2",
      description:
        "Hands-on introduction to Docker: images, containers, volumes and compose. Bring your laptop.",
      subscribers: 42,
      maxSubscribers: null,
      url: "https://events.intra.42.fr/events/102",
    },
    {
      id: 103,
      name: "🛠 Hackathon: Neural link",
      beginAt: mins(26 * 60),
      endAt: mins(26 * 60 + 6 * 60),
      location: "The Hive",
      url: "https://events.intra.42.fr/events/103",
    },
    {
      id: 104,
      name: "🍝 Meetup: 42 Pasta Night",
      beginAt: mins(30),
      endAt: mins(150),
      location: null,
      url: "https://events.intra.42.fr/events/104",
    },
    {
      id: 105,
      name: "📚 Exam: Final Exam",
      beginAt: mins(12 * 24 * 60),
      endAt: mins(12 * 24 * 60 + 4 * 60),
      location: "Cluster 1",
      url: "https://events.intra.42.fr/exams/105",
    },
  ],
  eventSubscribers: (id: number) => {
    const count = (id % 12) + 6;
    const names = [
      "alex",
      "sam",
      "jordan",
      "riley",
      "casey",
      "morgan",
      "taylor",
      "quinn",
      "avery",
      "drew",
      "robin",
      "jamie",
    ];
    return Array.from({ length: count }, (_, i) => {
      const login = `${names[(id + i) % names.length]}${id}${i}`;
      return {
        login,
        displayName: login.charAt(0).toUpperCase() + login.slice(1),
        avatar: catImage(id * 100 + i),
        location: (id + i) % 3 !== 0 ? "fu-r1-p2" : null,
      };
    });
  },
  studentsPage: (offset: number) => {
    const list: StudentEntry[] = [
      {
        login: "aberger",
        displayname: "Anna Berger",
        image_url: catImage(11),
        begin_at: mins(-20 * 24 * 60),
        blackholed_at: mins(90 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "july",
        pool_year: "2023",
        level: 21.42,
        correction_point: 9,
        wallet: 2310,
      },
      {
        login: "bdewit",
        displayname: "Brent de Wit",
        image_url: catImage(12),
        begin_at: mins(-30 * 24 * 60),
        blackholed_at: mins(200 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "july",
        pool_year: "2022",
        level: 17.02,
        correction_point: 14,
        wallet: 1520,
      },
      {
        login: "cdupont",
        displayname: "Camille Dupont",
        image_url: catImage(13),
        begin_at: mins(-500 * 24 * 60),
        blackholed_at: mins(-400 * 24 * 60),
        active: false,
        alumni: true,
        pool_month: "november",
        pool_year: "2019",
        level: 8.9,
        correction_point: 3,
        wallet: 120,
      },
      {
        login: "dlaurens",
        displayname: "Denis Laurens",
        image_url: catImage(14),
        begin_at: mins(-25 * 24 * 60),
        blackholed_at: null,
        active: false,
        alumni: true,
        pool_month: "february",
        pool_year: "2020",
        level: 12.5,
        correction_point: 0,
        wallet: 0,
      },
      {
        login: "emartel",
        displayname: "Elisa Martel",
        image_url: catImage(15),
        begin_at: mins(-15 * 24 * 60),
        blackholed_at: mins(30 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "july",
        pool_year: "2024",
        level: 9.31,
        correction_point: 6,
        wallet: 780,
      },
      {
        login: "fvanden",
        displayname: "Félix Vandenbroeck",
        image_url: catImage(16),
        begin_at: mins(-45 * 24 * 60),
        blackholed_at: mins(60 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "july",
        pool_year: "2023",
        level: 14.77,
        correction_point: 11,
        wallet: 1220,
      },
      {
        login: "gpeeters",
        displayname: "Gaël Peeters",
        image_url: catImage(17),
        begin_at: mins(-10 * 24 * 60),
        blackholed_at: mins(15 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "may",
        pool_year: "2025",
        level: 4.56,
        correction_point: 2,
        wallet: 350,
      },
      {
        login: "hclaeys",
        displayname: "Hugo Claeys",
        image_url: catImage(18),
        begin_at: mins(-60 * 24 * 60),
        blackholed_at: mins(5 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "november",
        pool_year: "2022",
        level: 19.88,
        correction_point: 22,
        wallet: 3100,
      },
      {
        login: "ijeunhomme",
        displayname: "Iris Jeunhomme",
        image_url: catImage(19),
        begin_at: mins(-400 * 24 * 60),
        blackholed_at: null,
        active: false,
        alumni: true,
        pool_month: "february",
        pool_year: "2019",
        level: 11.1,
        correction_point: 0,
        wallet: 0,
      },
      {
        login: "jvdberg",
        displayname: "Joren van den Berg",
        image_url: catImage(20),
        begin_at: mins(-5 * 24 * 60),
        blackholed_at: mins(400 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "october",
        pool_year: "2025",
        level: 2.1,
        correction_point: 1,
        wallet: 90,
      },
      {
        login: "kvermeulen",
        displayname: "Kim Vermeulen",
        image_url: catImage(21),
        begin_at: mins(-70 * 24 * 60),
        blackholed_at: mins(120 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "july",
        pool_year: "2022",
        level: 16.4,
        correction_point: 8,
        wallet: 2050,
      },
      {
        login: "lgeertsen",
        displayname: "Lena Geertsen",
        image_url: catImage(22),
        begin_at: mins(-12 * 24 * 60),
        blackholed_at: mins(2 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "may",
        pool_year: "2025",
        level: 5.02,
        correction_point: 4,
        wallet: 410,
      },
      {
        login: "mvanhoof",
        displayname: "Max Vanhoof",
        image_url: catImage(23),
        begin_at: mins(-800 * 24 * 60),
        blackholed_at: mins(-500 * 24 * 60),
        active: false,
        alumni: true,
        pool_month: "july",
        pool_year: "2018",
        level: 7.6,
        correction_point: 0,
        wallet: 0,
      },
      {
        login: "ndeclercq",
        displayname: "Noor De Clercq",
        image_url: catImage(24),
        begin_at: mins(-35 * 24 * 60),
        blackholed_at: mins(75 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "november",
        pool_year: "2022",
        level: 13.03,
        correction_point: 5,
        wallet: 910,
      },
      {
        login: "otheys",
        displayname: "Olivier Theys",
        image_url: catImage(25),
        begin_at: mins(-8 * 24 * 60),
        blackholed_at: mins(20 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "may",
        pool_year: "2025",
        level: 3.77,
        correction_point: 3,
        wallet: 260,
      },
      {
        login: "pstoffel",
        displayname: "Paul Stoffel",
        image_url: catImage(26),
        begin_at: mins(-500 * 24 * 60),
        blackholed_at: null,
        active: false,
        alumni: true,
        pool_month: "july",
        pool_year: "2019",
        level: 9.9,
        correction_point: 0,
        wallet: 0,
      },
      {
        login: "qjacobs",
        displayname: "Quinn Jacobs",
        image_url: catImage(27),
        begin_at: mins(-20 * 24 * 60),
        blackholed_at: mins(150 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "july",
        pool_year: "2023",
        level: 11.55,
        correction_point: 7,
        wallet: 640,
      },
      {
        login: "rsegers",
        displayname: "Robin Segers",
        image_url: catImage(28),
        begin_at: mins(-55 * 24 * 60),
        blackholed_at: mins(10 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "november",
        pool_year: "2022",
        level: 18.21,
        correction_point: 16,
        wallet: 2400,
      },
      {
        login: "slefevre",
        displayname: "Sara Lefèvre",
        image_url: catImage(29),
        begin_at: mins(-30 * 24 * 60),
        blackholed_at: mins(90 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "july",
        pool_year: "2022",
        level: 15.34,
        correction_point: 12,
        wallet: 1750,
      },
      {
        login: "tclaen",
        displayname: "Tessa Claen",
        image_url: catImage(30),
        begin_at: mins(-3 * 24 * 60),
        blackholed_at: mins(500 * 24 * 60),
        active: true,
        alumni: false,
        pool_month: "october",
        pool_year: "2025",
        level: 1.2,
        correction_point: 0,
        wallet: 30,
      },
    ];
    const start = Math.min(offset, list.length);
    return {
      total: list.length,
      active: list.filter((e) => e.active === true).length,
      filtered: list.length,
      offset: start,
      limit: 60,
      options: {
        intakes: [
          { month: 10, year: 2025, label: "October 2025" },
          { month: 5, year: 2025, label: "May 2025" },
          { month: 7, year: 2024, label: "July 2024" },
        ],
        poolYears: [2025, 2024, 2023, 2022, 2020, 2019, 2018],
      },
      data: list.slice(start, start + 60),
    };
  },
  piscines: [
    { year: 2025, month: 7 },
    { year: 2025, month: 10 },
    { year: 2024, month: 7 },
  ],
  future: [
    {
      login: "znew",
      displayname: "Zoë New",
      image_url: catImage(31),
      begin_at: mins(45 * 24 * 60),
      active: true,
      pool_month: "october",
      pool_year: "2026",
    },
    {
      login: "yfresh",
      displayname: "Yann Fresh",
      image_url: catImage(32),
      begin_at: mins(80 * 24 * 60),
      active: true,
      pool_month: "january",
      pool_year: "2027",
    },
  ],
  piscinerRoster: [
    {
      login: "pprep",
      displayname: "Piscine Prep",
      image_url: catImage(33),
      begin_at: mins(-2 * 24 * 60),
      active: true,
      pool_month: "july",
      pool_year: "2025",
    },
    {
      login: "qquiz",
      displayname: "Quinn Quiz",
      image_url: catImage(34),
      begin_at: mins(-3 * 24 * 60),
      active: true,
      pool_month: "july",
      pool_year: "2025",
    },
  ],
};

// Test hook: `?mock&campus=<id>` overrides the mock campus so the Belgium-only
// features (Students, Clusters) can be exercised for other campuses.
if (mockMode) {
  const campus = Number(
    new URLSearchParams(window.location.search).get("campus"),
  );
  if (Number.isFinite(campus) && campus > 0) {
    (mock.me as { campusId: number | null }).campusId = campus;
  }
}
