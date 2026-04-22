import type { CSSProperties } from 'react';

export type IconName =
  | 'week' | 'backlog' | 'docs' | 'tasks' | 'calendar' | 'agent'
  | 'search' | 'plus' | 'chevron-down' | 'chevron-right' | 'chevron-left' | 'chevron-up'
  | 'filter' | 'more' | 'more-v' | 'edit' | 'bell' | 'settings' | 'close' | 'check'
  | 'link' | 'paperclip' | 'clock' | 'flag' | 'circle' | 'circle-check' | 'circle-dot'
  | 'sync' | 'send' | 'sparkle' | 'play' | 'pause' | 'file' | 'file-pdf' | 'sheet'
  | 'lock' | 'shield' | 'eye' | 'drag' | 'users' | 'money' | 'scale' | 'trend'
  | 'refresh' | 'table' | 'comment' | 'x' | 'download' | 'upload' | 'grid' | 'list'
  | 'arrow-up-right' | 'arrow-right' | 'trend-up' | 'trend-down'
  | 'dashboard' | 'boarding' | 'sdk' | 'mcp' | 'emulator' | 'invoicing'
  | 'trash' | 'share' | 'pencil' | 'folder-move' | 'folder' | 'pin' | 'info';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  sw?: number;
  style?: CSSProperties;
}

export function Icon({ name, size = 16, color = 'currentColor', sw = 1.6, style }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style,
    'aria-hidden': true,
  };

  // Icons below mirror the prototype (design_handoff_pathnotion/PathNotion.html ~line 815).
  switch (name) {
    case 'week':
      return <svg {...common}><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8 H17 M7 2 V6 M13 2 V6"/><circle cx="7.5" cy="12" r="0.8" fill={color} stroke="none"/><circle cx="12.5" cy="12" r="0.8" fill={color} stroke="none"/></svg>;
    case 'calendar':
      return <svg {...common}><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8 H17 M7 2 V6 M13 2 V6"/></svg>;
    case 'backlog':
      return <svg {...common}><rect x="2" y="4" width="5" height="12" rx="1"/><rect x="8" y="4" width="5" height="12" rx="1"/><rect x="14" y="4" width="4" height="12" rx="1"/></svg>;
    case 'docs':
      return <svg {...common}><path d="M5 2 H12 L15 5 V18 H5 Z"/><path d="M12 2 V5 H15 M7 9 H13 M7 12 H13 M7 15 H11"/></svg>;
    case 'tasks':
      return <svg {...common}><path d="M4 5 L6 7 L10 3"/><path d="M4 10 L6 12 L10 8"/><path d="M4 15 L6 17 L10 13"/><path d="M12 5 H17 M12 10 H17 M12 15 H17"/></svg>;
    case 'agent':
      return <svg {...common}><rect x="4" y="6" width="12" height="10" rx="2"/><path d="M10 3 V6 M7 10 V12 M13 10 V12 M8 14 H12"/><path d="M2 10 H4 M16 10 H18"/></svg>;
    case 'trash':
      // Lid + body + two inner bars. Matches the Material "delete" shape.
      return <svg {...common}><path d="M4 5.5h12"/><path d="M8 5.5V4a1.4 1.4 0 0 1 1.4-1.4h1.2A1.4 1.4 0 0 1 12 4v1.5"/><path d="M5.5 5.5l.8 10.5a1.6 1.6 0 0 0 1.6 1.5h4.2a1.6 1.6 0 0 0 1.6-1.5l.8-10.5"/><path d="M8.5 9v5M11.5 9v5"/></svg>;
    case 'share':
      // Person + plus — reads as "add someone" at a glance, matches Google Drive's share affordance.
      return <svg {...common}><circle cx="8" cy="6.5" r="2.4"/><path d="M3 16.5c0-2.6 2.2-4.5 5-4.5 1 0 1.9.2 2.7.6"/><path d="M15 10.5v5M12.5 13h5"/></svg>;
    case 'pencil':
      // Tighter pencil with a clear tip and ferrule line.
      return <svg {...common}><path d="M13.5 3.5l3 3-9.5 9.5H4v-3z"/><path d="M11.5 5.5l3 3"/></svg>;
    case 'folder-move':
      // Folder silhouette on the left, clear right-arrow inside.
      return <svg {...common}><path d="M2.5 5.5A1 1 0 0 1 3.5 4.5H7l1.2 1.3h8.3a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1z"/><path d="M8 10h6.5M12 8l2.5 2L12 12"/></svg>;
    case 'folder':
      return <svg {...common}><path d="M2.5 5.5 A1 1 0 0 1 3.5 4.5 H7 L8.2 5.8 H16.5 A1 1 0 0 1 17.5 6.8 V15 A1 1 0 0 1 16.5 16 H3.5 A1 1 0 0 1 2.5 15 Z"/></svg>;
    case 'pin':
      // Classic map-pin / thumbtack — head + shaft + point.
      return <svg {...common}><path d="M10 2 L13 5 L12 7 L16 11 L13 14 L9 10 L7 11 L4 8 L10 2 Z"/><path d="M7 11 L3 17"/></svg>;
    case 'info':
      return <svg {...common}><circle cx="10" cy="10" r="7"/><path d="M10 9v4.5M10 6.5v0.01"/></svg>;
    case 'dashboard':
      return <svg {...common}><rect x="3" y="3" width="6" height="8" rx="1"/><rect x="11" y="3" width="6" height="5" rx="1"/><rect x="3" y="13" width="6" height="4" rx="1"/><rect x="11" y="10" width="6" height="7" rx="1"/></svg>;
    case 'boarding':
      return <svg {...common}><path d="M4 17 V8 L10 3 L16 8 V17"/><path d="M8 17 V12 H12 V17"/><circle cx="10" cy="9" r="1.5"/></svg>;
    case 'sdk':
      return <svg {...common}><path d="M7 5 L3 10 L7 15"/><path d="M13 5 L17 10 L13 15"/><path d="M11 4 L9 16"/></svg>;
    case 'mcp':
      return <svg {...common}><circle cx="10" cy="10" r="3"/><path d="M10 3 V5 M10 15 V17 M3 10 H5 M15 10 H17 M5.5 5.5 L6.8 6.8 M13.2 13.2 L14.5 14.5 M5.5 14.5 L6.8 13.2 M13.2 6.8 L14.5 5.5"/></svg>;
    case 'emulator':
      return <svg {...common}><rect x="5" y="3" width="10" height="14" rx="2"/><path d="M8 14 H12"/></svg>;
    case 'invoicing':
      return <svg {...common}><path d="M5 3 H14 L15 4 V17 L13 15.5 L11 17 L9 15.5 L7 17 L5 15.5 Z"/><path d="M7 7 H13 M7 10 H13 M7 13 H11"/></svg>;
    case 'search':
      return <svg {...common}><circle cx="9" cy="9" r="5"/><path d="m16 16-3.5-3.5"/></svg>;
    case 'plus':
      return <svg {...common}><path d="M10 4v12M4 10h12"/></svg>;
    case 'chevron-down':
      return <svg {...common}><path d="m5 8 5 5 5-5"/></svg>;
    case 'chevron-right':
      return <svg {...common}><path d="m8 5 5 5-5 5"/></svg>;
    case 'chevron-left':
      return <svg {...common}><path d="m12 5-5 5 5 5"/></svg>;
    case 'chevron-up':
      return <svg {...common}><path d="m5 12 5-5 5 5"/></svg>;
    case 'filter':
      return <svg {...common}><path d="M3 5 H17 M6 10 H14 M8.5 15 H11.5"/></svg>;
    case 'more':
      return <svg {...common}><circle cx="5" cy="10" r="1.2" fill={color} stroke="none"/><circle cx="10" cy="10" r="1.2" fill={color} stroke="none"/><circle cx="15" cy="10" r="1.2" fill={color} stroke="none"/></svg>;
    case 'more-v':
      return <svg {...common}><circle cx="10" cy="5" r="1.2" fill={color} stroke="none"/><circle cx="10" cy="10" r="1.2" fill={color} stroke="none"/><circle cx="10" cy="15" r="1.2" fill={color} stroke="none"/></svg>;
    case 'edit':
      return <svg {...common}><path d="M4 16v-3l9-9 3 3-9 9z"/></svg>;
    case 'bell':
      return <svg {...common}><path d="M5 14V9a5 5 0 1 1 10 0v5l2 2H3z"/><path d="M8 17a2 2 0 0 0 4 0"/></svg>;
    case 'settings':
      return <svg {...common}><circle cx="10" cy="10" r="2.5"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.5 1.5M13.5 13.5 15 15M5 15l1.5-1.5M13.5 6.5 15 5"/></svg>;
    case 'close':
    case 'x':
      return <svg {...common}><path d="m5 5 10 10M15 5 5 15"/></svg>;
    case 'check':
      return <svg {...common}><path d="m4 10 4 4 8-9"/></svg>;
    case 'link':
      // Two chain-links, angled. Cleaner than the previous curve salad.
      return <svg {...common}><path d="M9 11a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2L10 5.8"/><path d="M11 9a3 3 0 0 0-4.2 0L4.5 11.3a3 3 0 0 0 4.2 4.2L10 14.2"/></svg>;
    case 'paperclip':
      return <svg {...common}><path d="M15 9 9 15a3 3 0 0 1-4-4l7-7a2 2 0 0 1 3 3l-7 7"/></svg>;
    case 'clock':
      return <svg {...common}><circle cx="10" cy="10" r="6"/><path d="M10 6.5V10l2.5 1.5"/></svg>;
    case 'flag':
      return <svg {...common}><path d="M5 3v14"/><path d="M5 4c4-2 6 2 10 0v7c-4 2-6-2-10 0"/></svg>;
    case 'circle':
      return <svg {...common}><circle cx="10" cy="10" r="6"/></svg>;
    case 'circle-check':
      return <svg {...common}><circle cx="10" cy="10" r="6"/><path d="m7 10 2 2 4-4"/></svg>;
    case 'circle-dot':
      return <svg {...common}><circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="1.8" fill={color} stroke="none"/></svg>;
    case 'sync':
    case 'refresh':
      return <svg {...common}><path d="M4 9a6 6 0 0 1 11-3l1 1"/><path d="M16 11a6 6 0 0 1-11 3l-1-1"/><path d="M13 5h3V2M7 15H4v3"/></svg>;
    case 'send':
      return <svg {...common}><path d="M4 10 16 4l-4 12-3-5z"/></svg>;
    case 'sparkle':
      return <svg {...common}><path d="M10 3 L11.5 8.5 L17 10 L11.5 11.5 L10 17 L8.5 11.5 L3 10 L8.5 8.5 Z"/></svg>;
    case 'play':
      return <svg {...common}><path d="M6 4.5v11l9-5.5z"/></svg>;
    case 'pause':
      return <svg {...common}><rect x="5.5" y="4.5" width="3" height="11" rx="0.6"/><rect x="11.5" y="4.5" width="3" height="11" rx="0.6"/></svg>;
    case 'file':
      return <svg {...common}><path d="M5 3 H12 L15 6 V17 H5 Z"/><path d="M12 3 V6 H15"/></svg>;
    case 'file-pdf':
      return <svg {...common}><path d="M5 3 H12 L15 6 V17 H5 Z"/><path d="M12 3 V6 H15"/><path d="M7 11 H9 M7 13.5 H10 M11.5 11 H13 M11.5 13.5 H13"/></svg>;
    case 'sheet':
      return <svg {...common}><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M3 8 H17 M3 12 H17 M8 4 V16 M13 4 V16"/></svg>;
    case 'lock':
      return <svg {...common}><rect x="4.5" y="9" width="11" height="8" rx="1.4"/><path d="M7 9V7a3 3 0 0 1 6 0v2"/></svg>;
    case 'shield':
      return <svg {...common}><path d="M10 3 4 5v4c0 4 2.5 6.5 6 8 3.5-1.5 6-4 6-8V5z"/></svg>;
    case 'eye':
      return <svg {...common}><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="10" cy="10" r="2.2"/></svg>;
    case 'drag':
      return <svg {...common}><circle cx="7" cy="6" r="1.1" fill={color} stroke="none"/><circle cx="7" cy="10" r="1.1" fill={color} stroke="none"/><circle cx="7" cy="14" r="1.1" fill={color} stroke="none"/><circle cx="13" cy="6" r="1.1" fill={color} stroke="none"/><circle cx="13" cy="10" r="1.1" fill={color} stroke="none"/><circle cx="13" cy="14" r="1.1" fill={color} stroke="none"/></svg>;
    case 'users':
      return <svg {...common}><circle cx="7" cy="8" r="2.5"/><circle cx="14" cy="9" r="2"/><path d="M2.5 16c0-2 2-3.5 4.5-3.5s4.5 1.5 4.5 3.5M11 16c0-1.5 1.3-2.8 3-2.8s3 1.3 3 2.8"/></svg>;
    case 'money':
      return <svg {...common}><rect x="3" y="5.5" width="14" height="9" rx="1.5"/><circle cx="10" cy="10" r="2"/></svg>;
    case 'scale':
      return <svg {...common}><path d="M10 3v14"/><path d="M5 9H3l2-4 2 4H5M15 9h-2l2-4 2 4h-2"/><path d="M3 17h14"/></svg>;
    case 'trend':
    case 'trend-up':
      return <svg {...common}><path d="M3 14 8 9l3 3 6-6"/><path d="M12 6h5v5"/></svg>;
    case 'trend-down':
      return <svg {...common}><path d="M3 6l5 5 3-3 6 6"/><path d="M12 14h5v-5"/></svg>;
    case 'arrow-up-right':
      return <svg {...common}><path d="M6 14 14 6"/><path d="M8 6h6v6"/></svg>;
    case 'arrow-right':
      return <svg {...common}><path d="M4 10h12"/><path d="m12 6 4 4-4 4"/></svg>;
    case 'table':
    case 'grid':
      return <svg {...common}><rect x="3" y="3" width="14" height="14" rx="1.4"/><path d="M3 8h14M3 13h14M8 3v14M13 3v14"/></svg>;
    case 'list':
      return <svg {...common}><path d="M6 5h11M6 10h11M6 15h11"/><circle cx="3" cy="5" r="0.8" fill={color} stroke="none"/><circle cx="3" cy="10" r="0.8" fill={color} stroke="none"/><circle cx="3" cy="15" r="0.8" fill={color} stroke="none"/></svg>;
    case 'comment':
      return <svg {...common}><path d="M3 5h14v9H8l-4 3z"/></svg>;
    case 'download':
      // Arrow down + tray with side walls — clearer than a flat baseline.
      return <svg {...common}><path d="M10 3v10"/><path d="M5.5 9 10 13.5 14.5 9"/><path d="M4 14v2.5h12V14"/></svg>;
    case 'upload':
      // Arrow up + tray. Mirror of the sharpened download.
      return <svg {...common}><path d="M10 13V3.5"/><path d="M5.5 8 10 3.5 14.5 8"/><path d="M4 14v2.5h12V14"/></svg>;
    default:
      return null;
  }
}
