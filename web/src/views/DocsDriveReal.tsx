// Real Drive-integrated Docs experience.
// Loads folders and files from the shared drive the workspace has configured.
// Tree: lazy-loaded per folder. Middle pane shows current folder's direct children.
// Read-only for now — Phase 3 adds articles merging, Phase 4 wires file operations.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/primitives';
import { DocEditor } from '../components/DocEditor';
import { Dropdown } from '../components/Dropdown';
import { PageHeader } from '../components/PageHeader';
import { api, isFolder, type BusinessCategory, type DocSummary, type DriveEntry } from '../lib/api';
import {
  useArticlesInFolder,
  useBusinessCategories,
  useCreateDoc,
  useCreateDriveFolder,
  useDeleteDoc,
  useDriveChildren,
  useDriveConfig,
  useDriveEntry,
  useMoveDriveEntry,
  usePatchDoc,
  usePinFolder,
  usePinnedFolders,
  useProducts,
  useRenameDriveEntry,
  useTrashDriveEntry,
  useUnpinFolder,
  useUploadToDriveFolder,
} from '../lib/queries';
import type { FounderKey, Product } from '../lib/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function kindOf(e: DriveEntry): 'gdoc' | 'gsheet' | 'gslides' | 'upload' {
  if (e.mimeType === 'application/vnd.google-apps.document')     return 'gdoc';
  if (e.mimeType === 'application/vnd.google-apps.spreadsheet')  return 'gsheet';
  if (e.mimeType === 'application/vnd.google-apps.presentation') return 'gslides';
  return 'upload';
}

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function kindTint(kind: 'gdoc' | 'gsheet' | 'gslides' | 'upload'): string {
  switch (kind) {
    case 'gdoc':    return '#1E51B8';
    case 'gsheet':  return '#1E7D32';
    case 'gslides': return '#B14318';
    default:        return '#46555E';
  }
}

// Per-extension colour palette for uploaded files — same system as the rest of the app.
const FILE_TYPE_UPLOAD: Record<string, { label: string; bg: string; fg: string }> = {
  xlsx: { label: 'XLSX', bg: '#E7F5EA', fg: '#1E7D32' },
  xls:  { label: 'XLS',  bg: '#E7F5EA', fg: '#1E7D32' },
  csv:  { label: 'CSV',  bg: '#E7F5EA', fg: '#1E7D32' },
  docx: { label: 'DOCX', bg: '#E5EDFB', fg: '#1E51B8' },
  doc:  { label: 'DOC',  bg: '#E5EDFB', fg: '#1E51B8' },
  pptx: { label: 'PPTX', bg: '#FBE9E2', fg: '#B14318' },
  ppt:  { label: 'PPT',  bg: '#FBE9E2', fg: '#B14318' },
  pdf:  { label: 'PDF',  bg: '#FBE4E4', fg: '#B02626' },
  fig:  { label: 'FIG',  bg: '#F0EAFB', fg: '#5A2EB8' },
  png:  { label: 'PNG',  bg: '#E8F4FB', fg: '#1E6FB8' },
  jpg:  { label: 'JPG',  bg: '#E8F4FB', fg: '#1E6FB8' },
  jpeg: { label: 'JPEG', bg: '#E8F4FB', fg: '#1E6FB8' },
  gif:  { label: 'GIF',  bg: '#E8F4FB', fg: '#1E6FB8' },
  svg:  { label: 'SVG',  bg: '#E8F4FB', fg: '#1E6FB8' },
  mp4:  { label: 'MP4',  bg: '#FAEDFA', fg: '#7C2D92' },
  mov:  { label: 'MOV',  bg: '#FAEDFA', fg: '#7C2D92' },
  zip:  { label: 'ZIP',  bg: '#EEEEF0', fg: '#454745' },
  txt:  { label: 'TXT',  bg: '#F1F3F5', fg: '#46555E' },
};
function uploadStyle(ext: string): { label: string; bg: string; fg: string } {
  return FILE_TYPE_UPLOAD[ext] ?? { label: (ext || 'FILE').toUpperCase().slice(0, 5), bg: '#F1F3F5', fg: '#46555E' };
}

function humanBytes(b?: number | null): string {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Map a Drive owner email to our Founder key (best effort — the backend seed sets both founders' emails). */
function ownerKey(e: DriveEntry): FounderKey | 'A' {
  const email = (e.owners[0]?.emailAddress ?? '').toLowerCase();
  // Crude heuristic — real mapping will come when we have a proper users<->email registry.
  if (/dave|david/.test(email)) return 'D';
  if (/raj/.test(email))        return 'R';
  return 'D';
}

// ─── Top-level view ─────────────────────────────────────────────────────────

export type DocsMode = 'product' | 'finance' | 'sales' | 'legal';

/** Hero header copy per mode. Matches the classic DocsView's BUSINESS_CONFIG so the move
 *  into this view is seamless for the business routes. */
const MODE_CONFIG: Record<DocsMode, { title: string; sub: string }> = {
  product: {
    title: 'Documentation',
    sub: 'One space per product. Pages, sheets, decks, PDFs — all searchable in one place.',
  },
  finance: {
    title: 'Finance',
    sub: "Raj's parallel space. Pages, sheets, contracts, decks. Separate from product docs on purpose.",
  },
  sales: {
    title: 'Sales',
    sub: 'Pipeline, accounts, playbooks, pricing. Everything customer-facing.',
  },
  legal: {
    title: 'Legal',
    sub: 'Corporate, compliance, contracts, IP. Templates and executed versions in one place.',
  },
};

export function DocsDriveReal({ mode = 'product' }: { mode?: DocsMode }) {
  const cfgQ = useDriveConfig();
  const cfg = cfgQ.data;
  const header = MODE_CONFIG[mode];

  // null folderId = drive root. 'articles' virtual view shows every article across every folder.
  // Default to the "All articles" view on entry — feels more like a dashboard than dropping users
  // into an empty shared-drive root.
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [virtualView, setVirtualView] = useState<'articles' | null>('articles');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<DriveEntry[]>([]);
  const [newArticleOpen, setNewArticleOpen] = useState(false);
  // File operation dialogs — hoisted here so the preview drawer and row menus can share them.
  const [renameFor,  setRenameFor]  = useState<DriveEntry | null>(null);
  const [moveFor,    setMoveFor]    = useState<DriveEntry | null>(null);
  const [trashFor,   setTrashFor]   = useState<DriveEntry | null>(null);

  // When the workspace config loads, jump into the drive root.
  useEffect(() => {
    if (cfg?.driveId && currentFolderId === null) {
      setCurrentFolderId(cfg.driveId);
    }
  }, [cfg?.driveId, currentFolderId]);

  if (!cfg?.driveId) {
    return (
      <div className="screen-enter">
        <PageHeader title={header.title} sub={header.sub} />
        <div style={{
          background: 'var(--info-bg)',
          color: 'var(--info-fg)',
          padding: '14px 18px',
          borderRadius: 8,
          fontSize: 13,
        }}>
          No shared drive is configured yet. Open <b>Settings → Google → Drive workspace</b> and pick one.
        </div>
      </div>
    );
  }

  const isAtRoot = currentFolderId === cfg.driveId;

  return (
    <div className="screen-enter" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 90px)' }}>
      <PageHeader title={header.title} sub={header.sub} />

      {/* Layout: when the preview drawer is open we collapse the workspace tree entirely
          so the middle pane can breathe. Close the drawer (or use the breadcrumbs) to bring
          the tree back. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedFileId ? '1fr 440px' : '260px 1fr',
        gap: 14,
        flex: 1,
        minHeight: 0,
      }}>
        {!selectedFileId && (
          <FolderTree
            mode={mode}
            driveId={cfg.driveId}
            driveName={cfg.driveName ?? 'Shared drive'}
            currentFolderId={virtualView === 'articles' ? '__articles__' : (currentFolderId ?? cfg.driveId)}
            onOpenArticles={() => {
              setVirtualView('articles');
              setSelectedFileId(null);
            }}
            onOpen={(entry) => {
              setVirtualView(null);
              setCurrentFolderId(entry.id);
              setSelectedFileId(null);
              setCrumbs(buildCrumbsFromChain(crumbs, entry, cfg.driveId!));
            }}
            onRoot={() => {
              setVirtualView(null);
              setCurrentFolderId(cfg.driveId!);
              setSelectedFileId(null);
              setCrumbs([]);
            }}
          />
        )}

        <MiddlePane
          mode={mode}
          driveName={cfg.driveName ?? 'Shared drive'}
          driveId={cfg.driveId}
          parentId={currentFolderId ?? cfg.driveId}
          virtualView={virtualView}
          isAtRoot={isAtRoot}
          crumbs={crumbs}
          selectedFileId={selectedFileId}
          selectedArticleId={selectedArticleId}
          onOpenFile={(id) => { setSelectedFileId(id); setSelectedArticleId(null); }}
          onOpenArticle={(id) => { setSelectedArticleId(id); setSelectedFileId(null); }}
          onNewArticle={() => setNewArticleOpen(true)}
          onRename={(entry) => setRenameFor(entry)}
          onMove={(entry) => setMoveFor(entry)}
          onTrash={(entry) => setTrashFor(entry)}
          onCrumb={(idx) => {
            setVirtualView(null);
            if (idx < 0) {
              setCurrentFolderId(cfg.driveId!);
              setCrumbs([]);
            } else {
              const next = crumbs.slice(0, idx + 1);
              setCrumbs(next);
              setCurrentFolderId(next[next.length - 1]?.id ?? cfg.driveId!);
            }
            setSelectedFileId(null);
          }}
        />

        {selectedFileId && (
          <FilePreviewDrawer
            key={selectedFileId}
            fileId={selectedFileId}
            onClose={() => setSelectedFileId(null)}
          />
        )}
      </div>

      {/* Article editor — opens as its own drawer on top of everything. */}
      {selectedArticleId && (
        <DocEditor docId={selectedArticleId} onClose={() => setSelectedArticleId(null)} />
      )}

      {newArticleOpen && (
        <NewArticleDialog
          initialFolderId={virtualView === 'articles' ? null : (currentFolderId ?? cfg.driveId!)}
          onClose={() => setNewArticleOpen(false)}
          onCreated={(id) => {
            setNewArticleOpen(false);
            setSelectedArticleId(id);
            setSelectedFileId(null);
          }}
        />
      )}

      {renameFor && (
        <RenameDialog
          file={renameFor}
          onClose={() => setRenameFor(null)}
          onDone={() => setRenameFor(null)}
        />
      )}
      {moveFor && (
        <MoveDialog
          file={moveFor}
          driveId={cfg.driveId}
          driveName={cfg.driveName ?? 'Shared drive'}
          onClose={() => setMoveFor(null)}
          onDone={() => setMoveFor(null)}
        />
      )}
      {trashFor && (
        <ConfirmTrashDialog
          file={trashFor}
          onClose={() => setTrashFor(null)}
          onDone={() => {
            // If the trashed file was open in the drawer, close the drawer too.
            if (selectedFileId === trashFor.id) setSelectedFileId(null);
            setTrashFor(null);
          }}
        />
      )}
    </div>
  );
}

// ─── New article dialog ────────────────────────────────────────────────────

function NewArticleDialog({ initialFolderId, onClose, onCreated }: {
  initialFolderId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState<string>(''); // 'product:<id>' | 'business:<id>' | ''
  const productsQ = useProducts();
  const categoriesQ = useBusinessCategories();
  const createDoc = useCreateDoc();

  const products = productsQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  const options = useMemo(() => {
    const out: { value: string; label: string }[] = [{ value: '', label: '— No tag —' }];
    for (const p of products) out.push({ value: `product:${p.id}`, label: `Product · ${p.label}` });
    for (const c of categories) out.push({ value: `business:${c.id}`, label: `Business · ${c.label}` });
    return out;
  }, [products, categories]);

  const submit = async () => {
    if (!title.trim()) return;
    const body: Parameters<typeof api.docs.create>[0] = { title: title.trim() };
    if (initialFolderId) body.driveFolderId = initialFolderId;
    if (tag.startsWith('product:')) {
      body.product = tag.slice('product:'.length);
      body.root = 'product';
    } else if (tag.startsWith('business:')) {
      const bid = tag.slice('business:'.length);
      body.group = bid;
      // Use the business category id as the root when it matches a known root; otherwise 'product'.
      body.root = (['finance', 'sales', 'legal'].includes(bid) ? (bid as 'finance' | 'sales' | 'legal') : 'product');
    }
    try {
      const created = await createDoc.mutateAsync(body);
      onCreated(created.id);
    } catch (err) {
      alert(`Could not create article: ${(err as Error).message}`);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 440,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: 22,
          display: 'flex', flexDirection: 'column', gap: 14,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, color: 'var(--fg-1)' }}>New article</h2>
          <button type="button" onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={13} /></button>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's this article about?"
            className="input"
            style={{ width: '100%', height: 36, boxSizing: 'border-box' }}
          />
        </label>
        {/* Use <div> not <label> — wrapping a Dropdown's <button> trigger in a label
            causes clicks on options to bubble up and re-fire on the trigger, which
            re-opens the popup. Same bug pattern as the backlog new-item dialog. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Tag</span>
          <Dropdown<string>
            value={tag}
            onChange={setTag}
            options={options}
            ariaLabel="Tag"
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-4)' }}>
          Tagging groups articles on the <b>All articles</b> view. You can change the tag later.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim() || createDoc.isPending}>
            {createDoc.isPending ? 'Creating…' : 'Create and open'}
          </button>
        </div>
      </form>
    </div>
  );
}

function buildCrumbsFromChain(prev: DriveEntry[], entry: DriveEntry, driveRootId: string): DriveEntry[] {
  // If the clicked entry is already in the crumbs, trim back to it. Otherwise append.
  const idx = prev.findIndex((c) => c.id === entry.id);
  if (idx >= 0) return prev.slice(0, idx + 1);
  // If clicking a folder that's a direct child of the current crumb tail, append.
  const parent = entry.parents?.[0];
  if (!parent || parent === driveRootId) return [entry];
  if (prev.length && prev[prev.length - 1].id === parent) return [...prev, entry];
  // Fall back: single-level crumb.
  return [entry];
}

// ─── Folder tree ────────────────────────────────────────────────────────────

function FolderTree({ mode, driveId, driveName, currentFolderId, onOpenArticles, onOpen, onRoot }: {
  mode: DocsMode;
  driveId: string;
  driveName: string;
  currentFolderId: string;
  onOpenArticles: () => void;
  onOpen: (entry: DriveEntry) => void;
  onRoot: () => void;
}) {
  // In business modes the "All articles" row is scoped to that mode, so make the label explicit.
  const allArticlesLabel = mode === 'product' ? 'All articles' : `All ${mode} articles`;

  // Pinned-folder state threads into every folder row so Jeff's scan scope is visible.
  const pinnedQ = usePinnedFolders();
  const pin = usePinFolder();
  const unpin = useUnpinFolder();
  const pinnedIds = new Set((pinnedQ.data ?? []).map((p) => p.driveFolderId));
  const togglePin = (folder: DriveEntry) => {
    if (pinnedIds.has(folder.id)) unpin.mutate(folder.id);
    else pin.mutate({ driveFolderId: folder.id, folderName: folder.name });
  };
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: '10px 8px',
      overflow: 'auto',
      minHeight: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 4px 8px' }}>
        <Icon name="docs" size={14} color="var(--fg-2)" />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-1)' }}>Workspace</span>
      </div>
      <div className="mono" style={{ fontSize: 9, color: 'var(--fg-4)', padding: '0 8px 10px 24px', letterSpacing: '0.04em' }}>
        Shared drive · live from Google
      </div>

      {/* "All articles" virtual view — sits above the real folder tree. */}
      <div
        onClick={onOpenArticles}
        className="row-hover"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          background: currentFolderId === '__articles__' ? 'var(--bg-active)' : 'transparent',
          color: currentFolderId === '__articles__' ? 'var(--fg-1)' : 'var(--fg-2)',
          marginBottom: 4,
        }}
      >
        <Icon name="sparkle" size={12} color="var(--path-primary)" />
        <span style={{ fontSize: 12, flex: 1, fontWeight: currentFolderId === '__articles__' ? 500 : 400 }}>{allArticlesLabel}</span>
      </div>

      <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-4)', padding: '6px 8px 4px 8px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Folders</div>

      <div
        onClick={onRoot}
        className="row-hover"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          background: currentFolderId === driveId ? 'var(--bg-active)' : 'transparent',
          color: currentFolderId === driveId ? 'var(--fg-1)' : 'var(--fg-2)',
        }}
      >
        <span style={{ width: 10 }} />
        <FolderGlyph open={currentFolderId === driveId} tint="var(--path-primary)" />
        <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: currentFolderId === driveId ? 500 : 400 }}>
          {driveName}
        </span>
      </div>

      <DriveFolderChildren
        parentId={driveId}
        depth={1}
        currentFolderId={currentFolderId}
        onOpen={onOpen}
        pinnedIds={pinnedIds}
        onTogglePin={togglePin}
      />
    </div>
  );
}

function DriveFolderChildren({ parentId, depth, currentFolderId, onOpen, pinnedIds, onTogglePin }: {
  parentId: string;
  depth: number;
  currentFolderId: string;
  onOpen: (entry: DriveEntry) => void;
  pinnedIds: Set<string>;
  onTogglePin: (folder: DriveEntry) => void;
}) {
  const childrenQ = useDriveChildren(parentId, 'folders');
  const folders = childrenQ.data ?? [];
  if (childrenQ.isLoading) {
    return <div style={{ paddingLeft: 8 + depth * 14, fontSize: 11, color: 'var(--fg-4)' }}>Loading…</div>;
  }
  return (
    <>
      {folders.map((f) => (
        <TreeFolder
          key={f.id}
          folder={f}
          depth={depth}
          currentFolderId={currentFolderId}
          onOpen={onOpen}
          pinnedIds={pinnedIds}
          onTogglePin={onTogglePin}
        />
      ))}
    </>
  );
}

function TreeFolder({ folder, depth, currentFolderId, onOpen, pinnedIds, onTogglePin }: {
  folder: DriveEntry;
  depth: number;
  currentFolderId: string;
  onOpen: (entry: DriveEntry) => void;
  pinnedIds: Set<string>;
  onTogglePin: (folder: DriveEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const isActive = currentFolderId === folder.id;
  const tint = folder.name === 'Jeff' ? 'var(--info-fg)' : 'var(--fg-3)';
  const isPinned = pinnedIds.has(folder.id);

  return (
    <div>
      <div
        onClick={() => { setOpen((v) => !v); onOpen(folder); }}
        className="row-hover"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          paddingLeft: 8 + depth * 14,
          borderRadius: 4,
          cursor: 'pointer',
          background: isActive ? 'var(--bg-active)' : 'transparent',
          color: isActive ? 'var(--fg-1)' : 'var(--fg-2)',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={10} color="var(--fg-4)" />
        <FolderGlyph open={open} tint={tint} />
        <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 500 : 400 }}>
          {folder.name}
        </span>
        <PinToggle pinned={isPinned} onToggle={(e) => { e.stopPropagation(); onTogglePin(folder); }} />
      </div>
      {open && (
        <DriveFolderChildren
          parentId={folder.id}
          depth={depth + 1}
          currentFolderId={currentFolderId}
          onOpen={onOpen}
          pinnedIds={pinnedIds}
          onTogglePin={onTogglePin}
        />
      )}
    </div>
  );
}

/** Small pin button. Solid green when pinned; hidden until row hover when unpinned. */
function PinToggle({ pinned, onToggle }: { pinned: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={pinned ? 'Pinned — Jeff scans this folder. Click to unpin.' : 'Pin this folder for Jeff to scan'}
      aria-label={pinned ? 'Unpin folder' : 'Pin folder'}
      className={pinned ? '' : 'row-actions-btn'}
      style={{
        border: 0,
        background: 'transparent',
        padding: 2,
        display: 'inline-flex',
        alignItems: 'center',
        cursor: 'pointer',
        color: pinned ? 'var(--path-primary)' : 'var(--fg-4)',
        transform: pinned ? 'rotate(-30deg)' : 'rotate(-30deg)',
      }}
    >
      <Icon name="pin" size={12} />
    </button>
  );
}

function FolderGlyph({ open, tint }: { open: boolean; tint: string }) {
  if (open) {
    return (
      <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <path d="M1.5 3.5 A1 1 0 0 1 2.5 2.5 H5 L6.2 3.8 H11.5 A1 1 0 0 1 12.5 4.8 V5.5 H2.2 L1 9 V4.5" stroke={tint} strokeWidth="1.25" strokeLinejoin="round" fill={tint} fillOpacity="0.18" />
        <path d="M1.5 5.5 H12.5 L11.5 11 A1 1 0 0 1 10.5 11.7 H2.5 A1 1 0 0 1 1.5 10.7 Z" stroke={tint} strokeWidth="1.25" strokeLinejoin="round" fill={tint} fillOpacity="0.35" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1.5 3.5 A1 1 0 0 1 2.5 2.5 H5 L6.2 3.8 H11.5 A1 1 0 0 1 12.5 4.8 V10.5 A1 1 0 0 1 11.5 11.5 H2.5 A1 1 0 0 1 1.5 10.5 Z" stroke={tint} strokeWidth="1.25" strokeLinejoin="round" fill={tint} fillOpacity="0.28" />
    </svg>
  );
}

// ─── Middle pane: current folder contents ──────────────────────────────────

function MiddlePane({ mode, driveName, driveId, parentId, virtualView, isAtRoot, crumbs, selectedFileId, selectedArticleId, onOpenFile, onOpenArticle, onNewArticle, onRename, onMove, onTrash, onCrumb }: {
  mode: DocsMode;
  driveName: string;
  driveId: string;
  parentId: string;
  virtualView: 'articles' | null;
  isAtRoot: boolean;
  crumbs: DriveEntry[];
  selectedFileId: string | null;
  selectedArticleId: string | null;
  onOpenFile: (id: string) => void;
  onOpenArticle: (id: string) => void;
  onNewArticle: () => void;
  onRename: (entry: DriveEntry) => void;
  onMove: (entry: DriveEntry) => void;
  onTrash: (entry: DriveEntry) => void;
  onCrumb: (idx: number) => void;
}) {
  const inVirtual = virtualView === 'articles';
  const childrenQ = useDriveChildren(parentId, undefined, !inVirtual);
  const articlesQ = useArticlesInFolder(inVirtual ? '__all__' : parentId);
  const selectedEntryQ = useDriveEntry(selectedFileId);
  const entries = childrenQ.data ?? [];
  // Each mode only shows articles that live in its root. Product docs stay separate from
  // finance / sales / legal — those three are intentionally siloed.
  const articles = (articlesQ.data ?? []).filter((a) => a.root === mode);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const uploadMut = useUploadToDriveFolder();
  const createFolder = useCreateDriveFolder();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleNewFolder = async () => {
    const name = prompt('New folder name:');
    if (!name || !name.trim()) return;
    try {
      await createFolder.mutateAsync({ parent: parentId, name: name.trim() });
    } catch (err) {
      alert(`Couldn't create folder: ${(err as Error).message}`);
    }
  };

  const folders = entries.filter((e) => isFolder(e) && (!q || e.name.toLowerCase().includes(q)));
  const files = entries.filter((e) => !isFolder(e) && (!q || e.name.toLowerCase().includes(q)));
  const matchedArticles = articles.filter((a) => !q || a.title.toLowerCase().includes(q));

  const handleUploadFiles = async (list: FileList | null) => {
    if (!list || !list.length) return;
    // Uploads land in the folder you're currently viewing. Not allowed in the virtual "all articles" view.
    const target = parentId;
    try {
      for (const f of Array.from(list)) {
        await uploadMut.mutateAsync({ parent: target, file: f });
      }
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 2px 10px 2px',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          {inVirtual ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 4px' }}>
              <Icon name="sparkle" size={13} color="var(--path-primary)" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>
                {mode === 'product' ? 'All articles' : `All ${mode} articles`}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>across every folder</span>
            </span>
          ) : (
            <>
              <button onClick={() => onCrumb(-1)} style={breadcrumbStyle(isAtRoot)}>{driveName}</button>
              {crumbs.map((c, i) => (
                <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="chevron-right" size={10} color="var(--fg-4)" />
                  <button onClick={() => onCrumb(i)} style={breadcrumbStyle(i === crumbs.length - 1)}>{c.name}</button>
                </span>
              ))}
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 30, border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-surface)', minWidth: 220 }}>
          <Icon name="search" size={12} color="var(--fg-3)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={inVirtual ? 'Filter articles' : 'Filter this folder'}
            style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 12.5, color: 'var(--fg-1)', width: '100%' }}
          />
        </div>
        <button
          className="btn btn-ghost"
          title={inVirtual ? 'Open a folder to create sub-folders there' : 'Create a sub-folder here'}
          disabled={inVirtual || createFolder.isPending}
          onClick={handleNewFolder}
        >
          <Icon name="folder" size={13} /> {createFolder.isPending ? 'Creating…' : 'New folder'}
        </button>
        <button
          className="btn btn-ghost"
          title={inVirtual ? 'Open a folder to upload files there' : 'Upload files into this folder'}
          disabled={inVirtual || uploadMut.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="upload" size={13} /> {uploadMut.isPending ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            handleUploadFiles(e.target.files);
            // Reset so the same file can be picked again immediately.
            e.target.value = '';
          }}
        />
        <button
          className="btn btn-primary"
          title="Create a new article"
          onClick={onNewArticle}
        >
          <Icon name="plus" size={13} /> New article
        </button>
      </div>

      {/* When a Drive file is selected, the prototype's SelectionToolbar appears here —
          above the file list, not inside the preview drawer. Matches the handoff design exactly. */}
      {selectedEntryQ.data && (
        <SelectionToolbar
          file={selectedEntryQ.data}
          onRename={onRename}
          onMove={onMove}
          onTrash={onTrash}
        />
      )}

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {(childrenQ.isLoading || articlesQ.isLoading) && <div style={{ padding: 20, color: 'var(--fg-3)', fontSize: 13 }}>Loading…</div>}
        {childrenQ.error && (
          <div style={{ padding: 16, color: 'var(--danger-fg)', fontSize: 12.5 }}>
            {(childrenQ.error as Error).message}
          </div>
        )}

        {!childrenQ.isLoading && !articlesQ.isLoading && !childrenQ.error && entries.length === 0 && matchedArticles.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--fg-3)' }}>
            <div style={{ fontSize: 14, color: 'var(--fg-1)', fontWeight: 500, marginBottom: 6 }}>
              {inVirtual ? 'No articles yet.' : 'This folder is empty.'}
            </div>
            <div style={{ fontSize: 12.5 }}>
              {inVirtual
                ? 'Write your first one — click "New article" above.'
                : 'Drop files in Google Drive or add an article here.'}
            </div>
          </div>
        )}

        {!inVirtual && !childrenQ.isLoading && entries.length > 0 && files.length === 0 && folders.length > 0 && matchedArticles.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--fg-3)' }}>
            <div style={{ fontSize: 13, color: 'var(--fg-2)', fontWeight: 500, marginBottom: 4 }}>
              Only sub-folders here.
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>
              Pick one from the tree on the left to see its contents.
            </div>
          </div>
        )}

        {inVirtual && matchedArticles.length > 0 && (
          <ArticlesByTag
            articles={matchedArticles}
            selectedArticleId={selectedArticleId}
            onOpenArticle={onOpenArticle}
          />
        )}
        {!inVirtual && (files.length > 0 || matchedArticles.length > 0) && (
          <MergedList
            files={files}
            articles={matchedArticles}
            selectedFileId={selectedFileId}
            selectedArticleId={selectedArticleId}
            onOpenFile={onOpenFile}
            onOpenArticle={onOpenArticle}
            onTrashFile={onTrash}
          />
        )}
      </div>
    </div>
  );
}

/** Prototype's SelectionToolbar — appears above the file list when a Drive file is selected.
 *  Left-justified icon row: the six file actions plus a divider before the destructive one.
 *  No filename or close button — the preview drawer already shows the file name, and clicking
 *  anywhere else or the drawer's × deselects. */
function SelectionToolbar({ file, onRename, onMove, onTrash }: {
  file: DriveEntry;
  onRename: (file: DriveEntry) => void;
  onMove: (file: DriveEntry) => void;
  onTrash: (file: DriveEntry) => void;
}) {
  const kind = kindOf(file);
  const isGoogle = kind !== 'upload';

  const openInDrive = () => window.open(file.webViewLink ?? '#', '_blank', 'noopener,noreferrer');
  const download = () => {
    const a = document.createElement('a');
    a.href = api.drive.downloadUrl(file.id);
    a.rel = 'noopener';
    a.click();
  };
  const copyLink = () => { if (file.webViewLink) navigator.clipboard?.writeText(file.webViewLink); };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: '6px 10px',
      marginBottom: 10,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderLeft: '3px solid var(--path-primary)',
      borderRadius: 8,
    }}>
      {isGoogle
        ? <IconAction icon="arrow-up-right" label="Edit in Drive" onClick={openInDrive} />
        : <IconAction icon="download"       label="Download"     onClick={download} />}
      <IconAction icon="share"       label="Share in Drive"         onClick={openInDrive} />
      <IconAction icon="link"        label="Copy link"              onClick={copyLink} />
      <IconAction icon="folder-move" label="Move to another folder" onClick={() => onMove(file)} />
      <IconAction icon="pencil"      label="Rename"                 onClick={() => onRename(file)} />
      <span style={{ width: 1, height: 22, background: 'var(--border-subtle)', margin: '0 6px' }} />
      <IconAction icon="trash"       label="Move to trash" danger   onClick={() => onTrash(file)} />
    </div>
  );
}

function breadcrumbStyle(active: boolean): React.CSSProperties {
  return {
    border: 0,
    background: 'transparent',
    padding: '2px 4px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--fg-1)' : 'var(--fg-3)',
    cursor: 'pointer',
  };
}

// Name / Tag / Type / Edited / Avatar — matches the prototype's docs table layout.
const LIST_COLS = '24px 1fr 140px 120px 110px 32px';
const LIST_GAP = 14;

// ─── Article tag resolution ────────────────────────────────────────────────

interface ResolvedTag { key: string; label: string; color: string; }

/** Resolve an article's product or business-category tag into something renderable. */
function useTagResolver() {
  const productsQ = useProducts();
  const categoriesQ = useBusinessCategories();
  const byProductId = new Map<string, Product>();
  for (const p of productsQ.data ?? []) byProductId.set(p.id, p);
  const byCategoryId = new Map<string, BusinessCategory>();
  for (const c of categoriesQ.data ?? []) byCategoryId.set(c.id, c);

  return (a: DocSummary): ResolvedTag | null => {
    if (a.product && byProductId.has(a.product)) {
      const p = byProductId.get(a.product)!;
      return { key: `product:${p.id}`, label: p.label, color: p.color };
    }
    if (a.group && byCategoryId.has(a.group)) {
      const c = byCategoryId.get(a.group)!;
      return { key: `business:${c.id}`, label: c.label, color: '#6B7280' };
    }
    // Finance / sales / legal as last-resort roots.
    if (a.root && a.root !== 'product') {
      return { key: `root:${a.root}`, label: a.root[0].toUpperCase() + a.root.slice(1), color: '#6B7280' };
    }
    return null;
  };
}

// ─── All-articles virtual view (grouped by tag) ────────────────────────────

function ArticlesByTag({ articles, selectedArticleId, onOpenArticle }: {
  articles: DocSummary[];
  selectedArticleId: string | null;
  onOpenArticle: (id: string) => void;
}) {
  const resolve = useTagResolver();

  // Bucket articles by their resolved tag key.
  const groups = new Map<string, { tag: ResolvedTag | null; items: DocSummary[] }>();
  for (const a of articles) {
    const t = resolve(a);
    const key = t?.key ?? '__untagged__';
    const entry = groups.get(key);
    if (entry) entry.items.push(a);
    else groups.set(key, { tag: t, items: [a] });
  }

  // Stable order: product groups first (by label), business groups next, untagged last.
  const sorted = [...groups.values()].sort((a, b) => {
    const order = (t: ResolvedTag | null) => {
      if (!t) return 3;
      if (t.key.startsWith('product:')) return 0;
      if (t.key.startsWith('business:')) return 1;
      return 2;
    };
    const oa = order(a.tag);
    const ob = order(b.tag);
    if (oa !== ob) return oa - ob;
    return (a.tag?.label ?? 'zz').localeCompare(b.tag?.label ?? 'zz');
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {sorted.map(({ tag, items }) => (
        <ArticleTable
          key={tag?.key ?? '__untagged__'}
          tag={tag}
          articles={items}
          selectedArticleId={selectedArticleId}
          onOpenArticle={onOpenArticle}
        />
      ))}
    </div>
  );
}

function ArticleTable({ tag, articles, selectedArticleId, onOpenArticle }: {
  tag: ResolvedTag | null;
  articles: DocSummary[];
  selectedArticleId: string | null;
  onOpenArticle: (id: string) => void;
}) {
  return (
    <div>
      <div className="section-h" style={{ alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          {tag
            ? <><span style={{ width: 8, height: 8, borderRadius: 2, background: tag.color }} /> {tag.label}</>
            : <><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--fg-4)' }} /> Untagged</>}
        </h2>
        <span className="meta" style={{ fontSize: 10 }}>{articles.length} item{articles.length === 1 ? '' : 's'}</span>
      </div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-surface)' }}>
        <ListHeader />
        {articles.map((a) => (
          <ArticleRow
            key={a.id}
            article={a}
            tag={tag}
            selected={selectedArticleId === a.id}
            onOpen={() => onOpenArticle(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Merged list used inside a folder (files + articles together) ──────────

function MergedList({ files, articles, selectedFileId, selectedArticleId, onOpenFile, onOpenArticle, onTrashFile }: {
  files: DriveEntry[];
  articles: DocSummary[];
  selectedFileId: string | null;
  selectedArticleId: string | null;
  onOpenFile: (id: string) => void;
  onOpenArticle: (id: string) => void;
  onTrashFile: (file: DriveEntry) => void;
}) {
  const resolve = useTagResolver();
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <ListHeader />
      {/* Articles first — they're ours. Then Drive files. */}
      {articles.map((a) => (
        <ArticleRow
          key={a.id}
          article={a}
          tag={resolve(a)}
          selected={selectedArticleId === a.id}
          onOpen={() => onOpenArticle(a.id)}
        />
      ))}
      {files.map((f) => (
        <FileRow
          key={f.id}
          file={f}
          selected={selectedFileId === f.id}
          onOpen={() => onOpenFile(f.id)}
          onTrash={() => onTrashFile(f)}
        />
      ))}
    </div>
  );
}

function ListHeader() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: LIST_COLS,
      gap: LIST_GAP,
      padding: '8px 14px',
      background: 'var(--bg-sunken)',
      borderBottom: '1px solid var(--border-subtle)',
      fontSize: 10,
      color: 'var(--fg-4)',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
    }}>
      <span />
      <span>Name</span>
      <span>Tags</span>
      <span>Type</span>
      <span>Edited</span>
      <span />
    </div>
  );
}

function ArticleRow({ article, tag, selected, onOpen }: {
  article: DocSummary;
  tag: ResolvedTag | null;
  selected: boolean;
  onOpen: () => void;
}) {
  const patchDoc = usePatchDoc();
  const deleteDoc = useDeleteDoc();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside + Escape to close the menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const onRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    const next = prompt('Rename article:', article.title);
    if (!next || !next.trim() || next.trim() === article.title) return;
    try { await patchDoc.mutateAsync({ id: article.id, patch: { title: next.trim() } }); }
    catch (err) { alert(`Rename failed: ${(err as Error).message}`); }
  };

  const onDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!confirm(`Delete article "${article.title}"? This can't be undone.`)) return;
    try { await deleteDoc.mutateAsync(article.id); }
    catch (err) { alert(`Delete failed: ${(err as Error).message}`); }
  };

  return (
    <div
      onClick={onOpen}
      title="Click to open the article in the editor"
      className="row-hover"
      style={{
        display: 'grid',
        gridTemplateColumns: LIST_COLS,
        gap: LIST_GAP,
        padding: '10px 14px',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        background: selected ? 'var(--bg-active)' : 'transparent',
        userSelect: 'none',
      }}
    >
      <Icon name="docs" size={16} color="var(--fg-3)" />
      <span style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.title}</span>
      </span>
      {tag
        ? (
          <span className="tag" style={{ color: tag.color }}>
            <span className="tag-dot" style={{ background: tag.color }} />
            {tag.label}
          </span>
        )
        : <span />}
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>{article.size ?? ''}</span>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>
        {article.updated ? `Edited ${article.updated}` : ''}
      </span>
      {/* Last column — avatar by default, 3-dot menu on hover (or while open). */}
      <div ref={menuRef} style={{ position: 'relative', width: 32, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
        <span style={{ opacity: menuOpen ? 0 : 1, transition: 'opacity 120ms ease' }}>
          <Avatar who={(article.by as FounderKey | 'A') ?? 'D'} size={20} />
        </span>
        <button
          className={`row-actions-btn ${menuOpen ? 'row-actions-btn--open' : ''}`}
          title="More actions"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 24,
            background: 'transparent', border: 0, borderRadius: 4,
            cursor: 'pointer',
            color: 'var(--fg-3)',
          }}
        >
          <Icon name="more" size={14} />
        </button>
        {menuOpen && (
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4,
            minWidth: 160, zIndex: 40,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, boxShadow: 'var(--shadow-3)', padding: 4,
          }}>
            <ArticleMenuItem icon="pencil" label="Rename" onClick={onRename} />
            <ArticleMenuItem icon="arrow-up-right" label="Open" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onOpen(); }} />
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 2px' }} />
            <ArticleMenuItem icon="trash" label="Delete" danger onClick={onDelete} />
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleMenuItem({ icon, label, onClick, danger }: {
  icon: 'pencil' | 'arrow-up-right' | 'trash';
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '7px 10px',
        border: 0, borderRadius: 6,
        background: 'transparent',
        color: danger ? 'var(--danger-fg)' : 'var(--fg-1)',
        fontSize: 12.5,
        textAlign: 'left', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon name={icon} size={13} color={danger ? 'var(--danger-fg)' : 'var(--fg-2)'} />
      <span>{label}</span>
    </button>
  );
}

function FileRow({ file, selected, onOpen, onTrash }: { file: DriveEntry; selected: boolean; onOpen: () => void; onTrash: () => void }) {
  const kind = kindOf(file);
  return (
    <div
      onClick={onOpen}
      onDoubleClick={() => window.open(file.webViewLink ?? '#', '_blank', 'noopener,noreferrer')}
      title="Click to preview · Double-click to open in Drive"
      className="row-hover"
      style={{
        display: 'grid',
        gridTemplateColumns: LIST_COLS,
        gap: LIST_GAP,
        padding: '10px 14px',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        background: selected ? 'var(--bg-active)' : 'transparent',
        userSelect: 'none',
      }}
    >
      <FileGlyph kind={kind} ext={extFromName(file.name)} />
      <span style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
      </span>
      <span />
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>{file.size != null ? humanBytes(file.size) : ''}</span>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{file.modifiedTime ? `Edited ${relativeTime(file.modifiedTime)}` : ''}</span>
      {/* Last column — avatar by default, trash button revealed on row hover. Saves a trip
          to the top toolbar for the most common destructive action on a long file list. */}
      <div style={{ position: 'relative', width: 32, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
        <Avatar who={ownerKey(file)} size={20} />
        <button
          className="row-actions-btn"
          title="Move to trash"
          aria-label={`Delete ${file.name}`}
          onClick={(e) => { e.stopPropagation(); onTrash(); }}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 24,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 4, cursor: 'pointer',
            color: 'var(--danger-fg)',
          }}
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Rename + Move + Trash dialogs ──────────────────────────────────────────

function RenameDialog({ file, onClose, onDone }: {
  file: DriveEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(file.name);
  const rename = useRenameDriveEntry();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === file.name) { onClose(); return; }
    try {
      await rename.mutateAsync({ id: file.id, name: trimmed });
      onDone();
    } catch (err) {
      alert(`Rename failed: ${(err as Error).message}`);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Rename file">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Name</span>
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', height: 36, boxSizing: 'border-box' }}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={rename.isPending || !name.trim()}>
            {rename.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function MoveDialog({ file, driveId, driveName, onClose, onDone }: {
  file: DriveEntry;
  driveId: string;
  driveName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pickedId, setPickedId] = useState<string>(driveId);
  const [pickedName, setPickedName] = useState<string>(driveName);
  const move = useMoveDriveEntry();

  const submit = async () => {
    const from = file.parents?.[0];
    if (pickedId === from) { onClose(); return; }
    try {
      await move.mutateAsync({ id: file.id, parentId: pickedId, fromParentId: from });
      onDone();
    } catch (err) {
      alert(`Move failed: ${(err as Error).message}`);
    }
  };

  return (
    <ModalShell onClose={onClose} title={`Move "${file.name}"`} width={480}>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>
        Pick a destination folder. Click a row to select; it highlights in blue.
      </div>
      <div style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        maxHeight: 320,
        overflow: 'auto',
        padding: 4,
        background: 'var(--bg-sunken)',
      }}>
        <MoveTreeRow
          name={driveName}
          id={driveId}
          depth={0}
          pickedId={pickedId}
          onPick={(id, n) => { setPickedId(id); setPickedName(n); }}
        />
        <MoveFolderChildren
          parentId={driveId}
          depth={1}
          pickedId={pickedId}
          onPick={(id, n) => { setPickedId(id); setPickedName(n); }}
        />
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 10 }}>
        Moving to: <b style={{ color: 'var(--fg-1)' }}>{pickedName}</b>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={submit} className="btn btn-primary" disabled={move.isPending}>
          {move.isPending ? 'Moving…' : 'Move here'}
        </button>
      </div>
    </ModalShell>
  );
}

function MoveFolderChildren({ parentId, depth, pickedId, onPick }: {
  parentId: string;
  depth: number;
  pickedId: string;
  onPick: (id: string, name: string) => void;
}) {
  const childrenQ = useDriveChildren(parentId, 'folders');
  const folders = childrenQ.data ?? [];
  if (childrenQ.isLoading) {
    return <div style={{ paddingLeft: 8 + depth * 14, fontSize: 11, color: 'var(--fg-4)' }}>Loading…</div>;
  }
  return (
    <>
      {folders.map((f) => (
        <MoveTreeFolder key={f.id} folder={f} depth={depth} pickedId={pickedId} onPick={onPick} />
      ))}
    </>
  );
}

function MoveTreeFolder({ folder, depth, pickedId, onPick }: {
  folder: DriveEntry;
  depth: number;
  pickedId: string;
  onPick: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <MoveTreeRow
        name={folder.name}
        id={folder.id}
        depth={depth}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        pickedId={pickedId}
        onPick={onPick}
      />
      {open && (
        <MoveFolderChildren parentId={folder.id} depth={depth + 1} pickedId={pickedId} onPick={onPick} />
      )}
    </div>
  );
}

function MoveTreeRow({ name, id, depth, open, onToggle, pickedId, onPick }: {
  name: string;
  id: string;
  depth: number;
  open?: boolean;
  onToggle?: () => void;
  pickedId: string;
  onPick: (id: string, name: string) => void;
}) {
  const active = pickedId === id;
  return (
    <div
      onClick={() => onPick(id, name)}
      className="row-hover"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        paddingLeft: 8 + depth * 14,
        borderRadius: 4,
        cursor: 'pointer',
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--fg-1)' : 'var(--fg-2)',
      }}
    >
      {onToggle
        ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            style={{ border: 0, background: 'transparent', padding: 2, cursor: 'pointer', display: 'inline-flex' }}
          >
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={10} color="var(--fg-4)" />
          </button>
        )
        : <span style={{ width: 14 }} />}
      <FolderGlyph open={!!open} tint={active ? 'var(--path-primary)' : 'var(--fg-3)'} />
      <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: active ? 500 : 400 }}>{name}</span>
    </div>
  );
}

function ConfirmTrashDialog({ file, onClose, onDone }: {
  file: DriveEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const trash = useTrashDriveEntry();
  const submit = async () => {
    try {
      await trash.mutateAsync(file.id);
      onDone();
    } catch (err) {
      alert(`Couldn't move to trash: ${(err as Error).message}`);
    }
  };
  return (
    <ModalShell onClose={onClose} title="Move to trash?">
      <div style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
        Move <b style={{ color: 'var(--fg-1)' }}>{file.name}</b> to Google Drive's trash?
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--fg-3)' }}>
          You can restore it from Drive within 30 days.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button
          onClick={submit}
          className="btn btn-primary"
          disabled={trash.isPending}
          style={{ background: '#B02626', borderColor: '#B02626', color: '#fff' }}
        >
          {trash.isPending ? 'Moving…' : 'Move to trash'}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose, width = 440 }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: width,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: 22,
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: 'var(--fg-1)' }}>{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={13} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FileGlyph({ kind, ext, size = 'row' }: { kind: 'gdoc' | 'gsheet' | 'gslides' | 'upload'; ext: string; size?: 'row' | 'drawer' }) {
  const isDrawer = size === 'drawer';
  const box: React.CSSProperties = {
    width:  isDrawer ? 30 : 24,
    height: isDrawer ? 24 : 20,
    borderRadius: 3,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    fontSize: isDrawer ? 9.5 : 8.5,
    letterSpacing: 0.2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const label = { gdoc: 'Doc', gsheet: 'Sheet', gslides: 'Slides' } as const;
  const bg    = { gdoc: '#E5EDFB', gsheet: '#E7F5EA', gslides: '#FBE9E2' } as const;
  if (kind !== 'upload') {
    return <div style={{ ...box, background: bg[kind], color: kindTint(kind) }}>{label[kind]}</div>;
  }
  const s = uploadStyle(ext);
  return <div style={{ ...box, background: s.bg, color: s.fg }}>{s.label}</div>;
}

// ─── File preview drawer ───────────────────────────────────────────────────

function FilePreviewDrawer({ fileId, onClose }: {
  fileId: string;
  onClose: () => void;
}) {
  const entryQ = useDriveEntry(fileId);
  const entry = entryQ.data ?? null;
  const error = entryQ.error as Error | null | undefined;
  const [fullscreen, setFullscreen] = useState(false);

  // Esc exits fullscreen first, then nothing — drawer close is handled elsewhere.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  if (error) {
    return (
      <div style={drawerStyle()}>
        <DrawerHeader title="Error" kindColor="#B02626" onClose={onClose} onFullscreen={() => {}} onOpenDrive={() => {}} />
        <div style={{ padding: 20, color: 'var(--danger-fg)' }}>{error.message}</div>
      </div>
    );
  }
  if (!entry) {
    return (
      <div style={drawerStyle()}>
        <div style={{ padding: 20, color: 'var(--fg-3)' }}>Loading…</div>
      </div>
    );
  }

  const kind = kindOf(entry);
  const tint = kindTint(kind);
  const openInDrive = () => window.open(entry.webViewLink ?? '#', '_blank', 'noopener,noreferrer');

  return (
    <>
      <div style={drawerStyle()}>
        <DrawerHeader
          title={entry.name}
          kindColor={tint}
          subtitle={`${kindLabel(kind)} · ${relativeTime(entry.modifiedTime)}`}
          onClose={onClose}
          onFullscreen={() => setFullscreen(true)}
          onOpenDrive={openInDrive}
        />
        {/* Toolbar lives in the middle pane now (matches the prototype). This drawer shows
            the inline preview (Drive's own iframe viewer) + metadata. */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <DrivePreviewFrame entry={entry} kind={kind} />
            <DetailRow label="Owner">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Avatar who={ownerKey(entry)} size={18} />
                {entry.owners[0]?.displayName ?? entry.owners[0]?.emailAddress ?? '—'}
              </div>
            </DetailRow>
            <DetailRow label="Modified">{relativeTime(entry.modifiedTime)}</DetailRow>
            {entry.size != null && <DetailRow label="Size">{humanBytes(entry.size)}</DetailRow>}
            <DetailRow label="Type">{kindLabel(kind)}</DetailRow>
          </div>
        </div>
      </div>
      {fullscreen && (
        <FullscreenPreview entry={entry} onClose={() => setFullscreen(false)} onOpenDrive={openInDrive} />
      )}
    </>
  );
}

/** In-app fullscreen for the preview iframe — covers the whole viewport with a back button
 *  at the top-left so the user always has a way home. Replaces the old "Fullscreen = open
 *  Drive in a new tab" behaviour, which left users stranded on Drive's site. */
function FullscreenPreview({ entry, onClose, onOpenDrive }: { entry: DriveEntry; onClose: () => void; onOpenDrive: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1300,
      background: 'var(--bg-canvas)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}>
        <button
          onClick={onClose}
          className="btn btn-subtle"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13 }}
          autoFocus
        >
          <Icon name="chevron-left" size={14} sw={2.1} /> Back to Docs
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </div>
        <button
          onClick={onOpenDrive}
          className="btn btn-subtle"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13 }}
        >
          <Icon name="arrow-up-right" size={13} sw={2.1} /> Open in Drive
        </button>
      </div>
      <iframe
        src={`https://drive.google.com/file/d/${entry.id}/preview`}
        title={entry.name}
        style={{ flex: 1, width: '100%', border: 0, background: 'var(--bg-sunken)' }}
      />
    </div>
  );
}

/** Inline preview using Drive's own viewer endpoint. Works for Google-native docs, PDFs, images,
 *  videos — Drive figures out the right renderer. Requires the user to be signed in to the same
 *  Google account in the browser (which they already are if they can browse the shared drive).
 *  We can't catch cross-origin iframe errors reliably, so we also surface a fallback button below. */
function DrivePreviewFrame({ entry, kind }: { entry: DriveEntry; kind: 'gdoc' | 'gsheet' | 'gslides' | 'upload' }) {
  const ext = extFromName(entry.name).toLowerCase();
  // Drive's /preview URL renders the right viewer for each type — PDFs inline, images inline,
  // Office docs (docx/xlsx/pptx) via Google's converter, Google-native docs in their embed view,
  // HTML rendered, plain text / CSV in a reader. Blocked types (ZIP, etc.) fall back to a link card.
  const previewable =
    kind !== 'upload' ||
    [
      // PDFs + images
      'pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
      // Video
      'mp4', 'mov', 'webm',
      // Office
      'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt',
      // Markup + text
      'html', 'htm', 'txt', 'csv', 'md',
    ].includes(ext);
  const src = `https://drive.google.com/file/d/${entry.id}/preview`;

  if (!previewable) {
    return (
      <div style={{
        aspectRatio: '4/3',
        border: '1px dashed var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-sunken)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 10,
        padding: 20,
      }}>
        <FileGlyph kind={kind} ext={ext} size="drawer" />
        <div style={{ fontSize: 12, color: 'var(--fg-3)', textAlign: 'center' }}>
          No inline preview for <b>.{ext || 'this type'}</b>. Download it, or open in Drive from the toolbar above.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'var(--bg-sunken)',
      aspectRatio: '3/4',
    }}>
      <iframe
        src={src}
        title={entry.name}
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        // Drive's viewer sets its own CSP — sandbox would usually break auth state, so leave it off.
        allow="autoplay"
      />
    </div>
  );
}

/** Icon-only 36x36 action button used in the preview drawer toolbar.
 *  Mirrors the prototype's styling — tooltip via `title`, hover swaps background + foreground,
 *  `danger` flips to the red palette. */
function IconAction({ icon, label, onClick, danger }: {
  icon: 'arrow-up-right' | 'download' | 'share' | 'link' | 'folder-move' | 'pencil' | 'trash' | 'edit' | 'x';
  label: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        padding: 0,
        border: 0,
        borderRadius: 6,
        background: 'transparent',
        color: danger ? 'var(--danger-fg)' : 'var(--fg-2)',
        cursor: 'pointer',
        transition: 'background 120ms ease, color 120ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'var(--danger-bg)' : 'var(--bg-active)';
        e.currentTarget.style.color = danger ? 'var(--danger-fg)' : 'var(--fg-1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = danger ? 'var(--danger-fg)' : 'var(--fg-2)';
      }}
    >
      <Icon name={icon} size={18} sw={2.1} />
    </button>
  );
}

function drawerStyle(): React.CSSProperties {
  return {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  };
}

function DrawerHeader({ title, subtitle, kindColor, onClose, onFullscreen, onOpenDrive }: {
  title: string;
  subtitle?: string;
  kindColor: string;
  onClose: () => void;
  onFullscreen: () => void;
  onOpenDrive: () => void;
}) {
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      borderLeft: `3px solid ${kindColor}`,
      borderTopLeftRadius: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: `linear-gradient(100deg, ${kindColor}22 0%, transparent 55%)`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{subtitle}</div>}
      </div>
      <button className="btn btn-subtle btn-icon" onClick={onFullscreen} title="Open in fullscreen"><Icon name="expand" size={14} sw={2.1} /></button>
      <button className="btn btn-subtle btn-icon" onClick={onOpenDrive} title="Open in Drive"><Icon name="arrow-up-right" size={14} sw={2.1} /></button>
      <button className="btn btn-subtle btn-icon" onClick={onClose} title="Close"><Icon name="x" size={14} sw={2.1} /></button>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase', paddingTop: 2 }}>{label}</span>
      <span style={{ color: 'var(--fg-1)' }}>{children}</span>
    </div>
  );
}

function kindLabel(kind: 'gdoc' | 'gsheet' | 'gslides' | 'upload'): string {
  switch (kind) {
    case 'gdoc':    return 'Google Doc';
    case 'gsheet':  return 'Google Sheet';
    case 'gslides': return 'Google Slides';
    default:        return 'File';
  }
}
