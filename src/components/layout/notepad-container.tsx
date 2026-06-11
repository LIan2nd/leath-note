"use client";

import * as React from "react";
import { cn } from "~/lib/utils";
import { Loader2, Bold, Italic, Heading2, List, ListOrdered, Quote, Share2 } from "lucide-react";
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import Heading from "@tiptap/extension-heading";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { initializeContent, processContentChange } from "~/lib/date-history";
import { ShareNoteModal } from "./share-note-modal";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "~/components/ui/context-menu";

/** Custom Tiptap Node for Date Headers */
const ReadonlyDateHeading = Heading.extend({
  addNodeView() {
    return ReactNodeViewRenderer((props) => {
      const text = props.node.textContent;
      // Check if it's a date header: starts with calendar emoji
      if (text.startsWith("📅")) {
        return (
          <NodeViewWrapper
            className="flex items-center gap-2 my-6 opacity-60 select-none"
            contentEditable={false}
          >
            <div className="h-px bg-[#8a8070] flex-1 opacity-50"></div>
            <span className="text-xs font-bold font-mono text-[#8a8070] tracking-widest uppercase">
              {text}
            </span>
            <div className="h-px bg-[#8a8070] flex-1 opacity-50"></div>
          </NodeViewWrapper>
        );
      }
      
      // Fallback for normal headings
      return (
        <NodeViewWrapper>
          <NodeViewContent as={`h${props.node.attrs.level}`} />
        </NodeViewWrapper>
      );
    });
  },
});

interface NotepadContainerProps {
  noteId?: string | null;
  title: string;
  content: string;
  createdAt?: Date | null;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  isSaving?: boolean;
  authorName?: string | null;
  className?: string;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Title editor — textarea that wraps, collapses to 3 lines when blurred */
function TitleEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = React.useState(false);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  const LINE_HEIGHT = 32;
  const MAX_COLLAPSED_LINES = 3;
  const MAX_COLLAPSED_HEIGHT = LINE_HEIGHT * MAX_COLLAPSED_LINES;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const fullHeight = el.scrollHeight;
    const overflows = fullHeight > MAX_COLLAPSED_HEIGHT;
    setIsOverflowing(overflows);
    if (focused) {
      el.style.height = `${fullHeight}px`;
    } else {
      el.style.height = `${Math.min(fullHeight, MAX_COLLAPSED_HEIGHT)}px`;
    }
  }, [value, focused, MAX_COLLAPSED_HEIGHT]);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        placeholder="Untitled Note"
        className="title-input w-full resize-none overflow-hidden"
        style={{
          lineHeight: `${LINE_HEIGHT}px`,
          maxHeight: focused ? "none" : `${MAX_COLLAPSED_HEIGHT}px`,
        }}
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      {!focused && isOverflowing && (
        <button
          type="button"
          onClick={() => {
            setFocused(true);
            ref.current?.focus();
          }}
          className="typewriter-text mt-1 text-xs text-[#8a8070] opacity-60 hover:opacity-100 transition-opacity cursor-pointer pl-[75px]"
        >
          ▼ Show full title
        </button>
      )}
    </div>
  );
}

/** Floating toolbar that sits beside the paper like tools on a desk */
function EditorToolbar({ 
  editor, 
  onShare 
}: { 
  editor: ReturnType<typeof useEditor>;
  onShare: () => void;
}) {
  if (!editor) return null;

  const tools = [
    {
      icon: Bold,
      label: "Bold",
      shortcut: "Ctrl+B",
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive("bold"),
    },
    {
      icon: Italic,
      label: "Italic",
      shortcut: "Ctrl+I",
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive("italic"),
    },
    {
      icon: Heading2,
      label: "Heading",
      shortcut: "Ctrl+Alt+2",
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor.isActive("heading", { level: 2 }),
    },
    {
      icon: List,
      label: "Bullet List",
      shortcut: "Ctrl+Shift+8",
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive("bulletList"),
    },
    {
      icon: ListOrdered,
      label: "Numbered List",
      shortcut: "Ctrl+Shift+7",
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive("orderedList"),
    },
    {
      icon: Quote,
      label: "Quote",
      shortcut: "Ctrl+Shift+B",
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: editor.isActive("blockquote"),
    },
  ];

  return (
    <div className="notepad-toolbar">
      {tools.map((tool) => (
        <button
          key={tool.label}
          type="button"
          onClick={tool.action}
          title={`${tool.label} (${tool.shortcut})`}
          aria-label={tool.label}
          className={cn("notepad-toolbar-btn", tool.isActive && "active")}
        >
          <tool.icon className="h-4 w-4" />
        </button>
      ))}

      {/* Share Tool */}
      <div className="h-[1px] w-full bg-[#1a0f0a] my-1 opacity-20" />
      <button
        type="button"
        onClick={onShare}
        title="Share Aesthetic Card"
        aria-label="Share"
        className="notepad-toolbar-btn"
      >
        <Share2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function NotepadContainer({
  noteId,
  title,
  content,
  createdAt,
  onTitleChange,
  onContentChange,
  isSaving,
  authorName,
  className,
}: NotepadContainerProps) {
  // With `key={noteId}` set by parent, this component remounts on note switch.
  // So the editor is always created with the correct initial content — no sync needed.

  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
  const [selectedText, setSelectedText] = React.useState("");

  // ─── Date History Logic ─────────────────────────────────────────────────
  // Initialize content with date headers (wraps legacy/new content)
  const effectiveCreatedAt = createdAt ?? new Date();
  const initializedContent = React.useMemo(
    () => initializeContent(content, effectiveCreatedAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // Only on mount (key={noteId} causes remount on switch)
  );

  // Notify parent of initialized content if it changed (e.g. legacy wrap)
  React.useEffect(() => {
    if (initializedContent !== content) {
      onContentChange(initializedContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Track the previous content for cross-section edit detection
  const prevContentRef = React.useRef(initializedContent);
  // Guard: skip processing when we programmatically set editor content
  const skipNextProcessRef = React.useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // Disable default heading
      }),
      ReadonlyDateHeading,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: initializedContent,
    editorProps: {
      attributes: {
        class: "notepad-editor",
      },
    },
    onUpdate: ({ editor: e }) => {
      const storage = e.storage as unknown as Record<string, { getMarkdown: () => string }>;
      const rawMd = storage.markdown!.getMarkdown();

      // Skip processing if this update was triggered by our own setContent
      if (skipNextProcessRef.current) {
        skipNextProcessRef.current = false;
        prevContentRef.current = rawMd;
        onContentChange(rawMd);
        return;
      }

      // Process through date-history logic
      const processed = processContentChange(
        prevContentRef.current,
        rawMd,
        effectiveCreatedAt,
      );

      // If processing changed the content, update editor
      if (processed !== rawMd) {
        skipNextProcessRef.current = true;
        // Save cursor position
        const { from, to } = e.state.selection;
        e.commands.setContent(processed);
        // Restore cursor (clamp to valid range)
        const maxPos = e.state.doc.content.size;
        e.commands.setTextSelection({
          from: Math.min(from, maxPos),
          to: Math.min(to, maxPos),
        });
      }

      prevContentRef.current = processed;
      onContentChange(processed);
    },
  });

  const handleShare = () => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    
    // If no selection, use a generic placeholder or the first paragraph
    if (empty) {
      // Maybe we can get the first 200 characters if nothing is selected?
      // For now, let's just use what's there or prompt to select.
      const text = editor.getText().slice(0, 300);
      setSelectedText(text);
    } else {
      const text = editor.state.doc.textBetween(from, to, " ");
      setSelectedText(text);
    }
    
    setIsShareModalOpen(true);
  };

  if (!noteId) {
    return (
      <div className="notepad-with-toolbar w-full">
        <div
          className={cn(
            "paper-container relative mx-auto flex min-h-[60vh] md:min-h-[800px] w-full max-w-2xl items-center justify-center overflow-hidden",
            className
          )}
          style={{ backgroundColor: "var(--paper-bg)" }}
        >
          <div className="text-center px-4">
            <p className="typewriter-text text-base md:text-xl opacity-50">
              Select a note or create a new one
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="notepad-with-toolbar w-full">
      {/* Toolbar — sits to the right of the paper like tools on a desk */}
      <EditorToolbar editor={editor} onShare={handleShare} />

      <div
        className={cn(
          "paper-container relative mx-auto min-h-[60vh] md:min-h-[800px] w-full max-w-2xl overflow-hidden",
          className
        )}
        style={{ backgroundColor: "var(--paper-bg)" }}
      >
        {/* Saving indicator */}
        {isSaving && (
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded bg-white/80 px-2 py-1 text-xs md:text-sm shadow">
            <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin text-gray-500" />
            <span className="text-gray-600">Saving...</span>
          </div>
        )}

        {/* Red margin line — hidden on very small screens */}
        <div className="absolute left-[40px] sm:left-[59px] top-0 h-full w-[2px] bg-[#e8b4b4] z-1" />

        {/* Paper header area */}
        <div className="relative pt-4 pb-3 md:pt-5 md:pb-4" style={{ backgroundColor: "var(--paper-bg)" }}>
          {createdAt && (
            <div className="mb-1 text-right pr-3 md:pr-5">
              <span className="typewriter-text text-[10px] md:text-xs text-[#8a8070]">
                Date: {formatDate(createdAt)}
              </span>
            </div>
          )}
          <TitleEditor value={title} onChange={onTitleChange} />
        </div>

        {/* Full-width blue separator line */}
        <div className="h-[2px] w-full bg-[#9fcae3] mb-3 md:mb-4" />

        {/* WYSIWYG editor content area */}
        <div className="notepad-body relative min-h-[50vh] md:min-h-[650px]">
          <ContextMenu>
            <ContextMenuTrigger>
              <EditorContent editor={editor} />
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuLabel>Editor Actions</ContextMenuLabel>
              <ContextMenuItem 
                onClick={handleShare}
                className="flex items-center gap-2"
              >
                <Share2 className="h-4 w-4" /> Share Aesthetic Card
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem 
                onClick={() => editor?.chain().focus().run()}
                className="opacity-50"
              >
                Focus Editor
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>

        {/* Author name */}
        {authorName && (
          <div className="relative px-4 py-3 text-right pr-6 border-t border-[#d4cfc7]">
            <span
              className="text-xs italic"
              style={{ color: "#6b5a4a", fontFamily: "'Courier Prime', monospace" }}
            >
              — {authorName}
            </span>
          </div>
        )}
      </div>

      <ShareNoteModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        selectedText={selectedText}
        noteTitle={title}
        authorName={authorName}
      />
    </div>
  );
}
