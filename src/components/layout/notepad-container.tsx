"use client";

import * as React from "react";
import { cn } from "~/lib/utils";
import { Loader2, Bold, Italic, Heading2, List, Quote } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

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
function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
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
  // Track the last noteId to detect note switches
  const lastNoteIdRef = React.useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "notepad-editor",
      },
    },
    onUpdate: ({ editor: e }) => {
      const storage = e.storage as unknown as Record<string, { getMarkdown: () => string }>;
      const md = storage.markdown!.getMarkdown();
      onContentChange(md);
    },
  });

  // When noteId changes (user switches notes), update editor content
  React.useEffect(() => {
    if (!editor) return;
    if (noteId !== lastNoteIdRef.current) {
      lastNoteIdRef.current = noteId ?? null;
      const storage = editor.storage as unknown as Record<string, { getMarkdown: () => string }>;
      const currentMd = storage.markdown!.getMarkdown();
      if (currentMd !== content) {
        editor.commands.setContent(content || "");
      }
    }
  }, [noteId, content, editor]);

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
      <EditorToolbar editor={editor} />

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
          <EditorContent editor={editor} />
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
    </div>
  );
}
