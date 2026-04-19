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
  | 'dashboard' | 'boarding' | 'sdk' | 'mcp' | 'emulator' | 'invoicing';

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

  switch (name) {
    case 'week':
    case 'calendar':
      return <svg {...common}><rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14"/><path d="M7 3v3M13 3v3"/></svg>;
    case 'backlog':
      return <svg {...common}><rect x="3" y="4" width="3.6" height="12" rx="0.8"/><rect x="8.2" y="4" width="3.6" height="9" rx="0.8"/><rect x="13.4" y="4" width="3.6" height="6" rx="0.8"/></svg>;
    case 'docs':
      return <svg {...common}><path d="M6 3h6l3 3v11H6z"/><path d="M12 3v3h3"/><path d="M8 10h5M8 13h5"/></svg>;
    case 'tasks':
      return <svg {...common}><path d="M4 5h2M4 10h2M4 15h2"/><path d="M9 5h7M9 10h7M9 15h7"/></svg>;
    case 'agent':
      return <svg {...common}><circle cx="10" cy="10" r="5.5"/><circle cx="8" cy="9" r="0.8" fill={color} stroke="none"/><circle cx="12" cy="9" r="0.8" fill={color} stroke="none"/><path d="M8 12c1 .8 3 .8 4 0"/></svg>;
    case 'dashboard':
      return <svg {...common}><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>;
    case 'boarding':
      return <svg {...common}><path d="M4 10l5 5 7-9"/></svg>;
    case 'sdk':
      return <svg {...common}><path d="M7 6l-4 4 4 4M13 6l4 4-4 4"/></svg>;
    case 'mcp':
      return <svg {...common}><circle cx="10" cy="10" r="6"/><path d="M10 4v12M4 10h12"/></svg>;
    case 'emulator':
      return <svg {...common}><rect x="3" y="5" width="14" height="10" rx="1.4"/><path d="M7 15v2M13 15v2M5 17h10"/></svg>;
    case 'invoicing':
      return <svg {...common}><path d="M6 3h8l2 2v12l-2-1-2 1-2-1-2 1-2-1-2 1V5z"/><path d="M8 8h4M8 11h4M8 14h2"/></svg>;
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
      return <svg {...common}><path d="M3 5h14l-5 6v4l-4 2v-6z"/></svg>;
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
      return <svg {...common}><path d="M8 12a3 3 0 0 0 4 0l3-3a3 3 0 0 0-4-4l-1 1"/><path d="M12 8a3 3 0 0 0-4 0l-3 3a3 3 0 0 0 4 4l1-1"/></svg>;
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
      return <svg {...common}><path d="M10 3v3M10 14v3M3 10h3M14 10h3"/><path d="m5.5 5.5 1.5 1.5M13 13l1.5 1.5M5.5 14.5 7 13M13 7l1.5-1.5"/></svg>;
    case 'play':
      return <svg {...common}><path d="M6 4.5v11l9-5.5z"/></svg>;
    case 'pause':
      return <svg {...common}><rect x="5.5" y="4.5" width="3" height="11" rx="0.6"/><rect x="11.5" y="4.5" width="3" height="11" rx="0.6"/></svg>;
    case 'file':
      return <svg {...common}><path d="M6 3h6l3 3v11H6z"/><path d="M12 3v3h3"/></svg>;
    case 'file-pdf':
      return <svg {...common}><path d="M6 3h6l3 3v11H6z"/><path d="M12 3v3h3"/><text x="7" y="14" fontSize="5" fill={color} stroke="none" fontFamily="sans-serif" fontWeight="700">PDF</text></svg>;
    case 'sheet':
      return <svg {...common}><path d="M6 3h6l3 3v11H6z"/><path d="M12 3v3h3"/><path d="M7 9h7M7 12h7M7 15h7M10 9v6"/></svg>;
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
      return <svg {...common}><path d="M10 3v10"/><path d="m6 9 4 4 4-4"/><path d="M4 16h12"/></svg>;
    case 'upload':
      return <svg {...common}><path d="M10 16V6"/><path d="m6 10 4-4 4 4"/><path d="M4 3h12"/></svg>;
    default:
      return null;
  }
}
