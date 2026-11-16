// Jeu d'icônes Dzaryx v4 (16/11/2026) — traits fins 1.8 px façon SF Symbols / Lucide, dessinées à la main en SVG.
// Remplace les emojis dans les boutons, onglets, menus : c'est ce qui fait « appli pro » (Linear, Revolut, Things…).
import type { CSSProperties, ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  chat: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M8.5 11h7M8.5 14h4" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  car: <><path d="M5 17h14M3 13l2.2-5.6A2 2 0 0 1 7.1 6h9.8a2 2 0 0 1 1.9 1.4L21 13v4H3z" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /></>,
  coins: <><circle cx="9" cy="9" r="6" /><path d="M15.5 9.2A6 6 0 1 1 9.2 15.5" /><path d="M9 6.5v5M7 8h3.2a1 1 0 0 1 0 2H8" /></>,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M21 9h-5a3 3 0 0 0 0 6h5z" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3" /></>,
  user: <><circle cx="12" cy="8" r="4.5" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="17" rx="3" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></>,
  repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  receipt: <><path d="M5 3h14v18l-3.5-2-3.5 2-3.5-2L5 21z" /><path d="M9 8h6M9 12h6" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M6 15h4" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  calc: <><rect x="4" y="2.5" width="16" height="19" rx="3" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></>,
  ticket: <><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M14 6v12" strokeDasharray="2 2.5" /></>,
  reply: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5" /></>,
  star: <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" />,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>,
  globe: <><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19M12 2.5a14.5 14.5 0 0 0 0 19" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  smartphone: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  film: <><rect x="2.5" y="3" width="19" height="18" rx="3" /><path d="M7 3v18M17 3v18M2.5 8H7M2.5 16H7M17 8h4.5M17 16h4.5M2.5 12h19" /></>,
  bulb: <><path d="M9 18h6M10 21.5h4" /><path d="M12 2.5a6.5 6.5 0 0 0-4 11.6c.6.5 1 1.2 1 2V16h6v-.1c0-.7.4-1.4 1-1.9a6.5 6.5 0 0 0-4-11.5z" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  handshake: <><path d="m11 17 2 2a1.4 1.4 0 0 0 2-2" /><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a5 5 0 0 1 5.9-.8l.5.3a3 3 0 0 0 2.1.3L21 6" /><path d="m21 3 1 11h-2M3 3 2 14l6.5 6.5a1.4 1.4 0 0 0 2-2M3 4h8" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  dumbbell: <><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" /></>,
  feather: <><path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5z" /><path d="M16 8 2 22M17.5 15H9" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2.5" /><path d="M8 21h8M12 17v4" /></>,
  route: <><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  camera: <><path d="M14.5 4h-5L7.5 6.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3.5z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4.5-4.5L6 21" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  checkCircle: <><circle cx="12" cy="12" r="9.5" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  edit: <><path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
  refresh: <><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" /><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  clock: <><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3 2" /></>,
  timer: <><circle cx="12" cy="13.5" r="8" /><path d="M12 9.5v4l2.5 1.5M10 2h4" /></>,
  hourglass: <><path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4" /></>,
  lock: <><rect x="4" y="11" width="16" height="10.5" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9.5" /><path d="M12 16v-4.5M12 8h.01" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
  play: <path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" />,
  pause: <path d="M7 4h3v16H7zM14 4h3v16h-3z" />,
  mic: <><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.7 1.2 2.8 2.5 2.8z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  target: <><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="1.5" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15v3M11.5 10v8M16 13v5M20.5 7v11" /></>,
  pie: <><path d="M21.2 15.9A10 10 0 1 1 8 2.8" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></>,
  pill: <><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z" /><path d="m8.5 8.5 7 7" /></>,
  lifebuoy: <><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="4" /><path d="m5.3 5.3 3.9 3.9M14.8 14.8l3.9 3.9M14.8 9.2l3.9-3.9M5.3 18.7l3.9-3.9" /></>,
  wind: <><path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2" /></>,
  compass: <><circle cx="12" cy="12" r="9.5" /><path d="m16 8-2 6-6 2 2-6z" /></>,
  sparkles: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 3v4M17 5h4M5 17v4M3 19h4" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4M9 13v1M15 13v1M2 14h2M20 14h2" /><circle cx="12" cy="3.5" r="1" /></>,
  layers: <><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>,
  building: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M9 21.5v-4h6v4M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h.01M16 15h.01" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="3" /><path d="m22 7-10 6L2 7" /></>,
  whatsapp: <><path d="M3 21l1.6-4.7A9 9 0 1 1 7.8 19.6z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8a4 4 0 0 1-2.1-2.1l.8-1-1-2z" /></>,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  power: <><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></>,
  scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></>,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  filter: <path d="M22 3H2l8 9.5V19l4 2v-8.5z" />,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  cloud: <path d="M17.5 19H8a6 6 0 1 1 1.3-11.9A7 7 0 0 1 22 11a4 4 0 0 1-4.5 8z" />,
  paw: <><circle cx="5.5" cy="10" r="2" /><circle cx="9.5" cy="5.5" r="2" /><circle cx="14.5" cy="5.5" r="2" /><circle cx="18.5" cy="10" r="2" /><path d="M8 17.5c0-2.5 1.8-5 4-5s4 2.5 4 5a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 8 17.5z" /></>,
  gamepad: <><rect x="2" y="6" width="20" height="12" rx="6" /><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01" /></>,
  plane: <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />,
  stethoscope: <><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" /><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4" /><circle cx="20" cy="10" r="2" /></>,
  smile: <><circle cx="12" cy="12" r="9.5" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
  brain: <><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18zM12 5v13" /></>,
  droplet: <path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z" />,
  bed: <><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" /></>,
  scale: <><path d="M16 16.5 19 9l3 7.5a3.5 3.5 0 0 1-6 0zM2 16.5 5 9l3 7.5a3.5 3.5 0 0 1-6 0z" /><path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></>,
  leaf: <><path d="M11 20A7 7 0 0 1 4 13c0-6 5-9 16-10-1 11-4 16-9 17z" /><path d="M4 20c3-4 6-7 10-9" /></>,
  ship: <><path d="M3 15l2 5h14l2-5-9-3-9 3z" /><path d="M6 13.5V8h12v5.5M12 4v4" /></>,
  watch: <><rect x="6" y="6" width="12" height="12" rx="3.5" /><path d="M9 6l.6-3.5h4.8L15 6M9 18l.6 3.5h4.8L15 18M12 9.5V12l1.5 1.5" /></>,
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>,
  utensils: <><path d="M7 2v9M4 2v5a3 3 0 0 0 6 0V2M7 11v11" /><path d="M17 22V2c-2.5 1.5-3.5 4-3.5 7v4H17" /></>,
  hexagon: <path d="M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3z" />,
};

export type IconName = keyof typeof P;
export const hasIcon = (n: string): n is IconName => n in P;

export function Icon({ name, size = 20, color = 'currentColor', stroke = 1.8, style, fill }: { name: IconName | string; size?: number; color?: string; stroke?: number; style?: CSSProperties; fill?: string }) {
  const body = P[name] ?? P.sparkles;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ?? 'none'} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block', ...style }} aria-hidden>
      {body}
    </svg>
  );
}

// ── Emoji → icône : les libellés gardent leur texte, l'emoji de tête devient une vraie icône (ou disparaît) ──
const EMOJI: Record<string, IconName> = {
  '🚗': 'car', '🚙': 'car', '🚘': 'car', '🏎': 'car', '🏠': 'home', '🏡': 'home', '🏘': 'building', '🏢': 'building',
  '✓': 'check', '✔': 'check', '✅': 'checkCircle', '☑': 'checkCircle', '❌': 'x', '✕': 'x', '✖': 'x',
  '⚙': 'settings', '🗑': 'trash', '📞': 'phone', '☎': 'phone', '📱': 'smartphone', '💬': 'chat', '🗨': 'chat', '📩': 'mail', '✉': 'mail', '📧': 'mail', '📨': 'mail',
  '📅': 'calendar', '🗓': 'calendar', '📆': 'calendar', '💰': 'coins', '💵': 'coins', '💶': 'coins', '💸': 'coins', '🪙': 'coins', '👛': 'wallet', '💼': 'wallet',
  '📋': 'list', '📝': 'edit', '✏': 'pen', '✍': 'pen', '🖊': 'pen', '👥': 'users', '👤': 'user', '🙋': 'user', '🔔': 'bell', '⭐': 'star', '🌟': 'star',
  '📷': 'camera', '📸': 'camera', '🖼': 'image', '🔁': 'repeat', '🔄': 'refresh', '↻': 'refresh', '⟳': 'refresh', '↩': 'undo', '➕': 'plus', '＋': 'plus',
  '🔍': 'search', '🔎': 'search', '📄': 'file', '📃': 'file', '📑': 'file', '📤': 'send', '🚀': 'send', '🧾': 'receipt', '💳': 'card', '🎁': 'gift',
  '📈': 'trend', '📊': 'chart', '📉': 'chart', '🏷': 'tag', '📣': 'megaphone', '📢': 'megaphone', '🌐': 'globe', '🌍': 'globe', '🌎': 'globe', '🎬': 'film', '🎥': 'film',
  '🤝': 'handshake', '💡': 'bulb', '🕊': 'feather', '💊': 'pill', '🆘': 'lifebuoy', '🌬': 'wind', '🔥': 'flame', '🏆': 'trophy', '🥇': 'trophy', '💪': 'dumbbell', '🏋': 'dumbbell',
  '📍': 'pin', '⏱': 'timer', '⏲': 'timer', '⏰': 'clock', '🕐': 'clock', '⏳': 'hourglass', '⌛': 'hourglass', '🔒': 'lock', '🔐': 'lock', '🔑': 'key', '🗝': 'key',
  '🚨': 'alert', '⚠': 'alert', '❗': 'alert', '‼': 'alert', 'ℹ': 'info', '▶': 'play', '⏸': 'pause', '📥': 'inbox', '🔗': 'link', '☀': 'sun', '🌙': 'moon',
  '🎯': 'target', '🧮': 'calc', '👁': 'eye', '👀': 'eye', '🖥': 'monitor', '💻': 'monitor', '🧭': 'compass', '✨': 'sparkles', '🤖': 'bot', '🦾': 'bot',
  '⚡': 'bolt', '❤': 'heart', '💙': 'heart', '🩺': 'stethoscope', '😄': 'smile', '🙂': 'smile', '😊': 'smile', '🧠': 'brain', '💧': 'droplet', '😴': 'bed', '🛏': 'bed',
  '⚖': 'scale', '✈': 'plane', '🛫': 'plane', '🎮': 'gamepad', '🦊': 'paw', '📚': 'book', '📖': 'book', '🛡': 'shield', '☁': 'cloud', '⬇': 'download', '📥 ': 'download', '⬆': 'upload',
  '📲': 'smartphone', '🔙': 'chevronLeft', '➡': 'arrowRight', '→': 'arrowRight', '📦': 'layers', '🗂': 'layers', '📁': 'layers', '🧹': 'trash', '⌚': 'watch', '🔭': 'eye', '👟': 'activity', '👆': 'target', '🫀': 'heart', '🪄': 'sparkles', '🛑': 'alert', '🗺': 'compass', '👑': 'trophy', '👉': 'arrowRight', '🏁': 'flag', '✂': 'scissors', '◀': 'chevronLeft', '↗': 'trend', '🪶': 'feather', '🤒': 'stethoscope', '🟢': 'checkCircle', '🛰': 'globe', '🛌': 'bed', '🗳': 'list', '🔮': 'sparkles', '🔬': 'search', '🔧': 'settings', '🔢': 'calc', '🔘': 'check', '🔕': 'bell', '🔊': 'megaphone', '🔇': 'bell', '📺': 'monitor', '📏': 'scale', '💾': 'download', '💱': 'repeat', '💚': 'heart', '💑': 'users', '💉': 'pill', '👻': 'smile', '🏅': 'trophy', '🎵': 'play', '🎙': 'mic', '🎉': 'sparkles', '🍽': 'utensils', '🍏': 'leaf', '🌗': 'moon', '⛈': 'cloud', '⏹': 'pause', '↘': 'chart', '📂': 'layers', '🏭': 'building', '🏨': 'building', '🎓': 'book', '👔': 'user', '🧪': 'bolt', '🛎': 'bell', '🌊': 'wind', '％': 'tag', '⏮': 'chevronLeft', '⏭': 'chevronRight', '⏯': 'play', '🔉': 'megaphone', '■': 'pause', '➤': 'send', '⛶': 'grid', '↕': 'repeat', '🌱': 'leaf', '🌿': 'leaf', '🍃': 'leaf', '🛳': 'ship', '🚢': 'ship', '⛴': 'ship', '🛂': 'book', '🎟': 'ticket', '🎫': 'ticket',
};
const LEAD = /^\s*((?:\p{Extended_Pictographic}|[✓✔✕↻⟳↩→＋])(?:️|‍(?:\p{Extended_Pictographic})️?|[\u{1F3FB}-\u{1F3FF}])*)\s*/u;

/** Sépare l'emoji de tête d'un libellé : { icon, text }. icon = nom d'icône connu, sinon null (l'emoji est retiré). */
export function splitEmoji(s: string): { icon: IconName | null; text: string; had: boolean } {
  const m = LEAD.exec(s);
  if (!m) return { icon: null, text: s, had: false };
  const e = m[1]!.replace(/️/g, '');
  const icon = EMOJI[e] ?? EMOJI[[...e][0] ?? ''] ?? null;
  const text = s.slice(m[0].length);
  return { icon, text: text || s, had: true };
}

/** Libellé « pro » : si le texte commence par un emoji → icône au trait + texte. */
export function Label({ children, size = 17, gap = 7 }: { children: ReactNode; size?: number; gap?: number }) {
  if (typeof children !== 'string') return <>{children}</>;
  const { icon, text, had } = splitEmoji(children);
  if (!had) return <>{children}</>;
  if (text === children) return <>{children}</>;   // libellé fait uniquement d'un emoji : on le garde
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap, minWidth: 0 }}>{icon && <Icon name={icon} size={size} />}<span style={{ minWidth: 0 }}>{text}</span></span>;
}

/** Emoji en ligne dans un texte de page → icône au trait de la même taille que le texte (sinon l'emoji reste). */
export function Ico({ e, color }: { e: string; color?: string }) {
  const k = e.replace(/️/g, '');
  const name = EMOJI[k] ?? EMOJI[[...k][0] ?? ''];
  if (!name) return <>{e} </>;
  return (
    <svg width="1.05em" height="1.05em" viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: '-0.16em', marginRight: '0.38em', flexShrink: 0, opacity: 0.9 }} aria-hidden>{P[name]}</svg>
  );
}
