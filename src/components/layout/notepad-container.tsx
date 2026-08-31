"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { cn } from "~/lib/utils";
import { BookOpenText, CalendarDays, Check, ChevronDown, Clock3, Loader2, PencilLine, Plus, Bold, Italic, Heading2, List, ListOrdered, Quote, Share2 } from "lucide-react";
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import Heading from "@tiptap/extension-heading";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { initializeContent, processContentChange } from "~/lib/date-history";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "~/components/ui/context-menu";
import { AsyncStatusMessage } from "~/components/ui/async-status-message";

const WORKSPACE_LOADING_MESSAGES = [
  "Laying out your writing space...",
  "Your notes are taking a little longer to arrive. Please keep this page open.",
  "If your shelf still does not appear, refresh the page and try once more.",
] as const;

const ShareNoteModal = dynamic(
  () => import("./share-note-modal").then((module) => module.ShareNoteModal),
  { ssr: false },
);

const ReadonlyDateHeading = Heading.extend({
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $anchor, empty } = selection;

        if (!empty) return false;

        // Check if cursor is at the very beginning of a textblock
        if ($anchor.parentOffset === 0) {
          const beforePos = $anchor.before();
          if (beforePos > 0) {
            const $before = editor.state.doc.resolve(beforePos);
            const nodeBefore = $before.nodeBefore;
            if (
              nodeBefore &&
              nodeBefore.type.name === "heading" &&
              nodeBefore.textContent.startsWith("📅")
            ) {
              // The cursor is directly after our date heading!
              // Returning true prevents the default backspace behavior.
              return true;
            }
          }
        }
        return false;
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => {
      const text = props.node.textContent;
      
      // Check if it's a date header: starts with calendar emoji
      if (text.startsWith("📅")) {
        return (
          <NodeViewWrapper
            className="flex items-center gap-2 opacity-60 select-none"
            style={{ 
              height: "calc(var(--line-height) * 2)",
              margin: 0,
              padding: 0
            }}
            contentEditable={false}
          >
            <div className="h-px bg-[#8a8070] flex-1 opacity-50"></div>
            <span className="flex items-center gap-1.5 text-xs font-bold font-mono text-[#8a8070] tracking-widest uppercase">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {text.replace("📅", "").trim()}
            </span>
            <div className="h-px bg-[#8a8070] flex-1 opacity-50"></div>
          </NodeViewWrapper>
        );
      }
      
      // Check if it's an edit marker: starts with pencil emoji
      if (text.startsWith("✏️ diedit:")) {
        const editedDate = text.replace(/^✏️ diedit:\s*/, "");
        return (
          <NodeViewWrapper
            as="h6"
            contentEditable={false}
          >
            <PencilLine className="mr-1.5 h-3 w-3" aria-hidden="true" />
            <span>Edited: {editedDate}</span>
          </NodeViewWrapper>
        );
      }
      
      // Fallback for normal headings
      const level = props.node.attrs.level as 1 | 2 | 3 | 4 | 5 | 6;
      const Tag = `h${level}` as const;
      return (
        <NodeViewWrapper>
          <NodeViewContent as={Tag as any} />
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
  onCreateNote?: () => void;
  isCreatingNote?: boolean;
  isLoading?: boolean;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
  authorName?: string | null;
  className?: string;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
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
        maxLength={500}
        rows={1}
        aria-label="Note title"
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
          className="typewriter-text mt-1 flex items-center gap-1 pl-[75px] text-xs text-[#6f675a] opacity-80 transition-opacity hover:opacity-100"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          Show full title
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
      action: () => {
        (editor.chain().focus() as any).toggleBold().run();
      },
      isActive: editor.isActive("bold"),
    },
    {
      icon: Italic,
      label: "Italic",
      shortcut: "Ctrl+I",
      action: () => {
        (editor.chain().focus() as any).toggleItalic().run();
      },
      isActive: editor.isActive("italic"),
    },
    {
      icon: Heading2,
      label: "Heading",
      shortcut: "Ctrl+Alt+2",
      action: () => {
        (editor.chain().focus() as any).toggleHeading({ level: 2 }).run();
      },
      isActive: editor.isActive("heading", { level: 2 }),
    },
    {
      icon: List,
      label: "Bullet List",
      shortcut: "Ctrl+Shift+8",
      action: () => {
        (editor.chain().focus() as any).toggleBulletList().run();
      },
      isActive: editor.isActive("bulletList"),
    },
    {
      icon: ListOrdered,
      label: "Numbered List",
      shortcut: "Ctrl+Shift+7",
      action: () => {
        (editor.chain().focus() as any).toggleOrderedList().run();
      },
      isActive: editor.isActive("orderedList"),
    },
    {
      icon: Quote,
      label: "Quote",
      shortcut: "Ctrl+Shift+B",
      action: () => {
        (editor.chain().focus() as any).toggleBlockquote().run();
      },
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
  onCreateNote,
  isCreatingNote = false,
  isLoading = false,
  hasUnsavedChanges = false,
  isSaving = false,
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
    ] as any,
    content: initializedContent,
    editorProps: {
      attributes: {
        class: "notepad-editor",
        role: "textbox",
        "aria-label": "Note content",
        "aria-multiline": "true",
      },
    },
    onCreate: ({ editor: e }) => {
      const storage = e.storage as unknown as Record<string, { getMarkdown: () => string }>;
      const rawMd = storage.markdown!.getMarkdown();
      // Set the initial baseline to Tiptap's normalized markdown
      // so we don't trigger a fake edit if it reformats list items, etc.
      prevContentRef.current = rawMd;
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
        initializedContent,
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

  if (isLoading) {
    return (
      <div className="notepad-with-toolbar w-full">
        <div
          className={cn(
            "paper-container relative mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center overflow-hidden md:min-h-[800px]",
            className,
          )}
          style={{ backgroundColor: "var(--paper-bg)" }}
        >
          <div className="w-full max-w-sm px-5">
            <AsyncStatusMessage
              active
              appearanceDelayMs={0}
              messages={WORKSPACE_LOADING_MESSAGES}
              className="border-[#746d61]/20 bg-[#746d61]/5 text-sm text-[#655d51] [&>svg]:text-[#746d61]"
            />
          </div>
        </div>
      </div>
    );
  }

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
          <div className="max-w-sm px-5 text-center">
            <BookOpenText className="mx-auto h-8 w-8 text-[#746d61]" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-xl font-semibold text-[#40382e]">
              A quiet page is ready.
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#655d51]">
              Choose a note from the sidebar, or begin with a fresh thought.
            </p>
            {onCreateNote && (
              <button
                type="button"
                onClick={onCreateNote}
                disabled={isCreatingNote}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#4a3728] px-4 py-2.5 font-serif text-sm font-semibold text-[#f3eadb] shadow-sm transition-colors hover:bg-[#5c4033] disabled:opacity-60"
              >
                {isCreatingNote ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                {isCreatingNote ? "Preparing your note..." : "Create a new note"}
              </button>
            )}
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
        {/* Red margin line — hidden on very small screens */}
        <div className="absolute left-[40px] sm:left-[59px] top-0 h-full w-[2px] bg-[#e8b4b4] z-1" />

        {/* Paper header area */}
        <div className="relative pt-4 pb-3 md:pt-5 md:pb-4" style={{ backgroundColor: "var(--paper-bg)" }}>
          <div className="mb-1 flex min-h-7 items-center justify-end gap-2 pl-[50px] pr-3 sm:pl-[75px] md:pr-5">
            {createdAt && (
              <span className="typewriter-text hidden text-[10px] text-[#8a8070] sm:inline md:text-xs">
                Date: {formatDate(createdAt)}
              </span>
            )}
            <div
              role="status"
              aria-live="polite"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#746d61]/20 bg-white/90 px-2.5 py-1 text-xs text-[#655d51] shadow-sm"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : hasUnsavedChanges ? (
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {isSaving ? "Saving..." : hasUnsavedChanges ? "Saving shortly..." : "All changes saved"}
              </span>
            </div>
          </div>
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
