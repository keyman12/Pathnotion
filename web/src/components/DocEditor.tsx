import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import { Icon } from './Icon';
import { SlashMenu, type SlashCommand } from './SlashMenu';
import React from 'react';
import { BlockHandle } from './BlockHandle';

class Catcher extends React.Component<{ name: string; children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    // Surface the error so we can read it from the preview.
    (window as unknown as { __lastErr?: unknown }).__lastErr = {
      component: this.props.name,
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 6).join(' | '),
      info: info.componentStack?.split('\n').slice(0, 4).join(' | '),
    };
  }
  render() { return this.state.err ? null : this.props.children; }
}
import { TableToolbar } from './TableToolbar';
import { Callout } from './CalloutNode';
import { PreservedBlock } from './PreservedBlockNode';
import { useDoc, usePatchDoc } from '../lib/queries';
import { blocksToTipTap, tipTapToBlocks } from '../lib/docBlocks';

interface Props {
  docId: string;
  onClose: () => void;
}

const SAVE_DEBOUNCE_MS = 800;

export function DocEditor({ docId, onClose }: Props) {
  const docQ = useDoc(docId);
  const patch = usePatchDoc();
  const [expanded, setExpanded] = useState(false);

  const initialContent = useMemo(() => {
    if (!docQ.data) return null;
    return blocksToTipTap(docQ.data.blocks ?? []);
  }, [docQ.data?.id]);

  const [title, setTitle] = useState('');
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastSavedTitleRef = useRef('');
  const lastSavedBlocksRef = useRef<string>('');
  const saveTimer = useRef<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
  // Tick whenever selection or content changes — forces the bubble menu
  // to re-read `editor.isActive(...)` so Bold / block-type highlight stays in sync.
  const [, setTick] = useState(0);

  // Read a pasted/dropped image file as a data URL and insert it as an Image node at the
  // current selection. Async (FileReader) so we dispatch the transaction once the data URL
  // is ready. Limit per file to keep doc payload sane — past 6 MB a single screenshot makes
  // the doc JSON heavy. Larger images get a friendly alert instead.
  const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
  const insertImageFromFile = useCallback((view: any, file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      alert(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — please use one under ${MAX_IMAGE_BYTES / 1024 / 1024} MB. (We'll move large images to Drive in a future update.)`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? '');
      if (!src) return;
      const schema = view.state.schema;
      const imageType = schema.nodes.image;
      if (!imageType) return;
      const node = imageType.create({ src, alt: file.name });
      view.dispatch(view.state.tr.replaceSelectionWith(node));
    };
    reader.onerror = () => alert(`Couldn't read ${file.name}.`);
    reader.readAsDataURL(file);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'paragraph' ? "Press '/' for commands, or just start typing…" : '',
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      // Inline images. The block-handle rail picks these up automatically so the user
      // can drag the image up or down to reorder it like any other block. Insertion
      // (paste, drop, slash menu) is handled below in `editorProps.handlePaste/handleDrop`.
      Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'doc-image' } }),
      Callout,
      PreservedBlock,
    ],
    content: initialContent ?? undefined,
    editorProps: {
      attributes: { class: 'prose doc-prose' },
      // Paste handler — intercept clipboard image data (Cmd-V from a screenshot, copied
      // image from a webpage). For now images are stored as base64 data URLs inside the
      // doc JSON; works without Drive being connected. If pasted images get heavy on a
      // doc, we can promote this to a Drive-upload pipeline later.
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const imageFiles: File[] = [];
        for (const it of Array.from(items)) {
          if (it.kind === 'file' && it.type.startsWith('image/')) {
            const f = it.getAsFile();
            if (f) imageFiles.push(f);
          }
        }
        if (!imageFiles.length) return false;
        for (const f of imageFiles) insertImageFromFile(view, f);
        return true;  // we handled it; don't paste raw bytes as text
      },
      // Drag-and-drop image files from Finder / Explorer onto the article.
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || !files.length) return false;
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (!imageFiles.length) return false;
        event.preventDefault();
        for (const f of imageFiles) insertImageFromFile(view, f);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      scheduleSave(ed.getJSON() as any);
      syncSlashMenu(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => syncSlashMenu(ed),
  }, [initialContent]);

  useEffect(() => {
    if (docQ.data) {
      setTitle(docQ.data.title);
      lastSavedTitleRef.current = docQ.data.title;
      lastSavedBlocksRef.current = JSON.stringify(docQ.data.blocks ?? []);
    }
  }, [docQ.data?.id]);

  const scheduleSave = useCallback((json: any) => {
    if (!docQ.data) return;
    const blocks = tipTapToBlocks(json);
    const serialised = JSON.stringify(blocks);
    const titleChanged = title !== lastSavedTitleRef.current;
    const blocksChanged = serialised !== lastSavedBlocksRef.current;
    if (!titleChanged && !blocksChanged) return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setStatus('saving');
    saveTimer.current = window.setTimeout(() => {
      const body: { title?: string; blocks?: typeof blocks } = {};
      if (titleChanged) body.title = title;
      if (blocksChanged) body.blocks = blocks;
      patch.mutate({ id: docId, patch: body }, {
        onSuccess: () => {
          if (titleChanged) lastSavedTitleRef.current = title;
          if (blocksChanged) lastSavedBlocksRef.current = serialised;
          setStatus('saved');
          window.setTimeout(() => setStatus('idle'), 1400);
        },
        onError: () => setStatus('idle'),
      });
    }, SAVE_DEBOUNCE_MS);
  }, [docId, title, patch, docQ.data?.id]);

  useEffect(() => {
    if (!editor || !docQ.data) return;
    if (title === lastSavedTitleRef.current) return;
    scheduleSave(editor.getJSON());
  }, [title, editor, docQ.data?.id, scheduleSave]);

  useEffect(() => () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  // Re-render on every editor change so the bubble menu reflects current marks / block type.
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((t) => t + 1);
    editor.on('selectionUpdate', bump);
    editor.on('update', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('update', bump);
    };
  }, [editor]);

  const syncSlashMenu = (ed: Editor) => {
    const { state } = ed;
    const { selection } = state;
    if (!selection.empty) { setSlashOpen(false); return; }
    const $from = selection.$from;
    const node = $from.parent;
    if (node.type.name !== 'paragraph') { setSlashOpen(false); return; }
    const text = node.textContent;
    if (text === '/') {
      const coords = ed.view.coordsAtPos(selection.from);
      setSlashPos({ top: coords.bottom + 4, left: coords.left });
      setSlashOpen(true);
    } else {
      setSlashOpen(false);
    }
  };

  const runSlashCommand = (cmd: SlashCommand) => {
    if (!editor) return;
    // Remove the '/' (and anything else in the triggering paragraph) before transforming the block.
    const { selection } = editor.state;
    const from = selection.$from.start();
    const to = selection.$from.end();
    editor.chain().focus().deleteRange({ from, to }).run();
    applyBlockCommand(editor, cmd);
    setSlashOpen(false);
  };

  const drawerWidth = expanded ? '100vw' : 'min(680px, 60vw)';

  if (docQ.isLoading) {
    return (
      <DrawerFrame width={drawerWidth} onClose={onClose}>
        <div style={{ padding: 48, color: 'var(--fg-3)' }}>Loading…</div>
      </DrawerFrame>
    );
  }
  if (docQ.isError || !docQ.data) {
    return (
      <DrawerFrame width={drawerWidth} onClose={onClose}>
        <div style={{ padding: 48, color: 'var(--danger-fg)' }}>Could not load this doc.</div>
      </DrawerFrame>
    );
  }

  const breadcrumb = docQ.data.group ?? docQ.data.product ?? docQ.data.root;

  return (
    <DrawerFrame width={drawerWidth} onClose={onClose}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 18px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <button className="btn btn-subtle btn-icon" onClick={onClose} title="Close"><Icon name="close" size={14} /></button>
        <div className="meta" style={{ fontSize: 10 }}>{breadcrumb}</div>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>
          {status === 'saving' ? 'saving…' : status === 'saved' ? 'saved' : 'autosaves'}
        </span>
        <button
          className="btn btn-subtle btn-icon"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Collapse to half width' : 'Expand to full screen'}
        >
          <Icon name={expanded ? 'chevron-right' : 'arrow-up-right'} size={13} />
        </button>
      </div>

      <div ref={bodyRef} className="doc-editor-body" style={{ flex: 1, overflow: 'auto', padding: '32px 28px 80px 28px', position: 'relative' }}>
        <div style={{ margin: '0 auto', maxWidth: expanded ? 760 : '100%', position: 'relative' }}>
          <input
            className="doc-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            style={{
              width: '100%',
              border: 0,
              outline: 'none',
              background: 'transparent',
              fontSize: 30,
              fontWeight: 600,
              color: 'var(--fg-1)',
              letterSpacing: '-0.015em',
              padding: '8px 0 14px 0',
              marginBottom: 4,
            }}
          />
          <EditorContent editor={editor} />
          <Catcher name="BlockHandle">
            <BlockHandle editor={editor} containerRef={bodyRef} />
          </Catcher>
          <TableToolbar editor={editor} containerRef={bodyRef} />
        </div>
      </div>

      {editor && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: ed, from, to }: { editor: Editor; from: number; to: number }) => from !== to && !ed.isActive('codeBlock')}
        >
          <InlineBubbleMenu editor={editor} />
        </BubbleMenu>
      )}

      {slashOpen && slashPos && (
        <SlashMenu position={slashPos} onPick={runSlashCommand} onClose={() => setSlashOpen(false)} />
      )}
    </DrawerFrame>
  );
}

// ─── Drawer frame ──────────────────────────────────────────────────────────

function DrawerFrame({ width, onClose, children }: {
  width: number | string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Only close when the user pressed the mouse down on the backdrop itself.
  // This prevents a drag-select that starts inside the editor and releases on
  // the backdrop from firing a click that closes the drawer.
  const downOnBackdrop = useRef(false);
  return (
    <div
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={() => {
        if (downOnBackdrop.current) onClose();
        downOnBackdrop.current = false;
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,26,0.55)',
        zIndex: 70,
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'fadeIn 120ms ease',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          maxWidth: '100vw',
          height: '100%',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 220ms cubic-bezier(.2,.8,.2,1)',
          transition: 'width 220ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Bubble menu on text selection ─────────────────────────────────────────

type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'todo' | 'quote' | 'callout-info';

const BLOCK_OPTIONS: { id: BlockType; label: string; hint: string }[] = [
  { id: 'p',            label: 'Text',          hint: '' },
  { id: 'h1',           label: 'Heading 1',     hint: '⌘⌥1' },
  { id: 'h2',           label: 'Heading 2',     hint: '⌘⌥2' },
  { id: 'h3',           label: 'Heading 3',     hint: '⌘⌥3' },
  { id: 'ul',           label: 'Bulleted list', hint: '⌘⇧8' },
  { id: 'ol',           label: 'Numbered list', hint: '⌘⇧7' },
  { id: 'todo',         label: 'To-do list',    hint: '' },
  { id: 'quote',        label: 'Quote',         hint: '' },
  { id: 'callout-info', label: 'Callout',       hint: '' },
];

const COLOR_PALETTE: { label: string; value: string | null }[] = [
  { label: 'Default', value: null },
  { label: 'Muted', value: '#7a7b80' },
  { label: 'Green', value: '#35d37a' },
  { label: 'Blue', value: '#5470D6' },
  { label: 'Purple', value: '#B794F4' },
  { label: 'Amber', value: '#F0A000' },
  { label: 'Red', value: '#E5484D' },
  { label: 'Pink', value: '#F472B6' },
];

function InlineBubbleMenu({ editor }: { editor: Editor }) {
  const [turnOpen, setTurnOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  const currentBlock = blockTypeFor(editor);
  const currentLabel = BLOCK_OPTIONS.find((o) => o.id === currentBlock)?.label ?? 'Text';
  const currentAlign: 'left' | 'center' | 'right' | 'justify' =
    editor.isActive({ textAlign: 'center' }) ? 'center'
    : editor.isActive({ textAlign: 'right' }) ? 'right'
    : editor.isActive({ textAlign: 'justify' }) ? 'justify'
    : 'left';
  const currentColor: string | null = (editor.getAttributes('textStyle').color as string | undefined) ?? null;

  const toolBtn = (title: string, active: boolean, onClick: () => void, content: React.ReactNode) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        height: 28,
        padding: '0 6px',
        border: 0,
        borderRadius: 4,
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--fg-1)' : 'var(--fg-2)',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {content}
    </button>
  );

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2,
      padding: 4,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 6,
      boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
    }}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setTurnOpen((v) => !v); }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 28,
          padding: '0 8px',
          border: 0,
          borderRadius: 4,
          background: 'transparent',
          color: 'var(--fg-1)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {currentLabel}
        <Icon name="chevron-down" size={11} />
      </button>
      {turnOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 4,
          marginTop: 6,
          minWidth: 200,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
          padding: 4,
          zIndex: 1,
        }}>
          {BLOCK_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyBlockCommand(editor, o.id === 'callout-info' ? 'callout-info' : (o.id as SlashCommand));
                setTurnOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                width: '100%',
                padding: '6px 10px',
                border: 0,
                borderRadius: 4,
                background: currentBlock === o.id ? 'var(--bg-active)' : 'transparent',
                color: 'var(--fg-1)',
                fontSize: 12.5,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>{o.label}</span>
              {o.hint && <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{o.hint}</span>}
            </button>
          ))}
        </div>
      )}

      <span style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 2px' }} />

      {toolBtn('Bold (⌘B)',       editor.isActive('bold'),       () => editor.chain().focus().toggleBold().run(),       <span style={{ fontWeight: 700 }}>B</span>)}
      {toolBtn('Italic (⌘I)',     editor.isActive('italic'),     () => editor.chain().focus().toggleItalic().run(),     <span style={{ fontStyle: 'italic' }}>I</span>)}
      {toolBtn('Underline (⌘U)',  editor.isActive('underline'),  () => editor.chain().focus().toggleUnderline().run(),  <span style={{ textDecoration: 'underline' }}>U</span>)}
      {toolBtn('Strikethrough',   editor.isActive('strike'),     () => editor.chain().focus().toggleStrike().run(),     <span style={{ textDecoration: 'line-through' }}>S</span>)}
      {toolBtn('Inline code',     editor.isActive('code'),       () => editor.chain().focus().toggleCode().run(),       <span className="mono">{'</>'}</span>)}
      {toolBtn('Link', editor.isActive('link'), () => {
        const prev = editor.getAttributes('link').href || '';
        const url = window.prompt('URL', prev);
        if (url == null) return;
        if (!url) editor.chain().focus().unsetLink().run();
        else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      }, <Icon name="link" size={12} />)}

      <span style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 2px' }} />

      {/* Alignment */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setAlignOpen((v) => !v); setColorOpen(false); }}
          title={`Align · ${currentAlign}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            minWidth: 34,
            height: 28,
            padding: '0 6px',
            border: 0,
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--fg-2)',
            cursor: 'pointer',
          }}
        >
          <AlignGlyph align={currentAlign} />
          <Icon name="chevron-down" size={10} />
        </button>
        {alignOpen && (
          <div style={popoverStyle}>
            {(['left', 'center', 'right', 'justify'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().setTextAlign(a).run();
                  setAlignOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '6px 10px',
                  border: 0,
                  borderRadius: 4,
                  background: currentAlign === a ? 'var(--bg-active)' : 'transparent',
                  color: 'var(--fg-1)',
                  fontSize: 12.5,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <AlignGlyph align={a} />
                <span>{a[0].toUpperCase() + a.slice(1)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Colour */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setColorOpen((v) => !v); setAlignOpen(false); }}
          title="Text colour"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            minWidth: 34,
            height: 28,
            padding: '0 6px',
            border: 0,
            borderRadius: 4,
            background: 'transparent',
            color: currentColor ?? 'var(--fg-2)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, textDecoration: 'underline' }}>A</span>
          <Icon name="chevron-down" size={10} />
        </button>
        {colorOpen && (
          <div style={{ ...popoverStyle, padding: 6, minWidth: 160 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {COLOR_PALETTE.map((c) => {
                const active = c.value === currentColor;
                return (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (c.value === null) editor.chain().focus().unsetColor().run();
                      else editor.chain().focus().setColor(c.value).run();
                      setColorOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 28,
                      width: '100%',
                      border: active ? '1px solid var(--path-primary)' : '1px solid var(--border-subtle)',
                      borderRadius: 4,
                      background: 'transparent',
                      color: c.value ?? 'var(--fg-2)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {c.value === null ? '×' : 'A'}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 6,
  minWidth: 140,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
  padding: 4,
  zIndex: 1,
};

function AlignGlyph({ align }: { align: 'left' | 'center' | 'right' | 'justify' }) {
  // Simple three-line glyph; which lines are shorter depends on alignment.
  const line = (w: number, offsetLeft = 0) => (
    <span style={{ display: 'block', height: 2, background: 'currentColor', borderRadius: 1, width: `${w}%`, marginLeft: `${offsetLeft}%` }} />
  );
  const layout =
    align === 'left'    ? [line(100), line(60), line(80)] :
    align === 'center'  ? [line(100, 0), line(60, 20), line(80, 10)] :
    align === 'right'   ? [line(100, 0), line(60, 40), line(80, 20)] :
                          [line(100), line(100), line(100)];
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, width: 12 }}>
      {layout.map((l, i) => <span key={i}>{l}</span>)}
    </span>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function blockTypeFor(editor: Editor): BlockType {
  if (editor.isActive('heading', { level: 1 })) return 'h1';
  if (editor.isActive('heading', { level: 2 })) return 'h2';
  if (editor.isActive('heading', { level: 3 })) return 'h3';
  if (editor.isActive('taskList')) return 'todo';
  if (editor.isActive('bulletList')) return 'ul';
  if (editor.isActive('orderedList')) return 'ol';
  if (editor.isActive('blockquote')) return 'quote';
  if (editor.isActive('callout')) return 'callout-info';
  return 'p';
}

function applyBlockCommand(editor: Editor, cmd: SlashCommand) {
  const insideCallout = editor.isActive('callout');
  // Unwrap a callout first when switching to any non-callout block type,
  // otherwise the new type would apply inside the callout wrapper.
  const chain = editor.chain().focus();
  switch (cmd) {
    case 'p':
      if (insideCallout) chain.lift('callout').setParagraph().run();
      else chain.setParagraph().run();
      break;
    case 'h1':
      if (insideCallout) chain.lift('callout').setHeading({ level: 1 }).run();
      else chain.setHeading({ level: 1 }).run();
      break;
    case 'h2':
      if (insideCallout) chain.lift('callout').setHeading({ level: 2 }).run();
      else chain.setHeading({ level: 2 }).run();
      break;
    case 'h3':
      if (insideCallout) chain.lift('callout').setHeading({ level: 3 }).run();
      else chain.setHeading({ level: 3 }).run();
      break;
    case 'ul':
      if (insideCallout) chain.lift('callout').toggleBulletList().run();
      else chain.toggleBulletList().run();
      break;
    case 'ol':
      if (insideCallout) chain.lift('callout').toggleOrderedList().run();
      else chain.toggleOrderedList().run();
      break;
    case 'todo':
      if (insideCallout) chain.lift('callout').toggleTaskList().run();
      else chain.toggleTaskList().run();
      break;
    case 'quote':
      if (insideCallout) chain.lift('callout').toggleBlockquote().run();
      else chain.toggleBlockquote().run();
      break;
    case 'code':
      if (insideCallout) chain.lift('callout').toggleCodeBlock().run();
      else chain.toggleCodeBlock().run();
      break;
    case 'divider':
      chain.setHorizontalRule().run();
      break;
    case 'table':
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      break;
    case 'callout-info':
      // Toggle — lift if already a callout, wrap otherwise.
      if (insideCallout) chain.lift('callout').run();
      else chain.setParagraph().wrapIn('callout', { tone: 'info' }).run();
      break;
    case 'callout-warn':
      if (insideCallout) chain.lift('callout').run();
      else chain.setParagraph().wrapIn('callout', { tone: 'warn' }).run();
      break;
  }
}
