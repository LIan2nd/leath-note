"use client";

import * as React from "react";
import { cn } from "~/lib/utils";
import { Loader2, Bold, Italic, Eye, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

  // Measure and resize whenever value or focus changes
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Temporarily expand to measure full height
    el.style.height = "auto";
    const fullHeight = el.scrollHeight;

    // Check if content exceeds 3 lines
    const overflows = fullHeight > MAX_COLLAPSED_HEIGHT;
    setIsOverflowing(overflows);

    // Apply correct height
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
      {/* Show expand hint ONLY when collapsed AND content exceeds 3 lines */}
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
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [previewMode, setPreviewMode] = React.useState(false);

  // Auto-resize textarea based on content
  React.useEffect(() => {
    if (textareaRef.current && !previewMode) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(500, textareaRef.current.scrollHeight)}px`;
    }
  }, [content, previewMode]);

  /** Wrap selected text with markdown syntax */
  const wrapSelection = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);

    // If already wrapped, unwrap
    const before = content.slice(start - prefix.length, start);
    const after = content.slice(end, end + suffix.length);
    if (before === prefix && after === suffix) {
      const newContent =
        content.slice(0, start - prefix.length) +
        selected +
        content.slice(end + suffix.length);
      onContentChange(newContent);
      // Restore cursor position
      requestAnimationFrame(() => {
        textarea.selectionStart = start - prefix.length;
        textarea.selectionEnd = end - prefix.length;
        textarea.focus();
      });
      return;
    }

    const newContent =
      content.slice(0, start) + prefix + selected + suffix + content.slice(end);
    onContentChange(newContent);

    // Move cursor to after the wrapped text
    requestAnimationFrame(() => {
      if (selected.length > 0) {
        textarea.selectionStart = start + prefix.length;
        textarea.selectionEnd = end + prefix.length;
      } else {
        textarea.selectionStart = start + prefix.length;
        textarea.selectionEnd = start + prefix.length;
      }
      textarea.focus();
    });
  };

  const handleBold = () => wrapSelection("**", "**");
  const handleItalic = () => wrapSelection("*", "*");

  /** Handle keyboard shortcuts in textarea */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") {
        e.preventDefault();
        handleBold();
      } else if (e.key === "i") {
        e.preventDefault();
        handleItalic();
      }
    }
  };

  if (!noteId) {
    return (
      <div
        className={cn(
          "paper-container relative mx-auto flex min-h-[800px] w-full max-w-2xl items-center justify-center overflow-hidden",
          className
        )}
        style={{ backgroundColor: "var(--paper-bg)" }}
      >
        <div className="text-center">
          <p className="typewriter-text text-xl opacity-50">
            Select a note or create a new one
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "paper-container relative mx-auto min-h-[800px] w-full max-w-2xl overflow-hidden",
        className
      )}
      style={{ backgroundColor: "var(--paper-bg)" }}
    >
      {/* Saving indicator — bottom right of paper */}
      {isSaving && (
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded bg-white/80 px-3 py-1 text-sm shadow">
          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          <span className="text-gray-600">Saving...</span>
        </div>
      )}

      {/* Red margin line — spans entire paper height */}
      <div className="absolute left-[59px] top-0 h-full w-[2px] bg-[#e8b4b4] z-1" />

      {/* Paper header area — title + date */}
      <div className="relative pt-5 pb-4" style={{ backgroundColor: "var(--paper-bg)" }}>
        {/* Date display — top right */}
        {createdAt && (
          <div className="mb-1 text-right pr-5">
            <span className="typewriter-text text-xs text-[#8a8070]">
              Date: {formatDate(createdAt)}
            </span>
          </div>
        )}

        {/* Title textarea — wraps, max 3 lines collapsed */}
        <TitleEditor
          value={title}
          onChange={onTitleChange}
        />
      </div>

      {/* Full-width blue separator line */}
      <div className="h-[2px] w-full bg-[#9fcae3] mb-4" />

      {/* Formatting toolbar */}
      <div className="flex items-center gap-1 px-4 pb-2 pl-[68px]">
        <button
          type="button"
          onClick={handleBold}
          disabled={previewMode}
          className="notepad-toolbar-btn"
          title="Bold (Ctrl+B)"
          aria-label="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleItalic}
          disabled={previewMode}
          className="notepad-toolbar-btn"
          title="Italic (Ctrl+I)"
          aria-label="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setPreviewMode((p) => !p)}
          className={cn("notepad-toolbar-btn", previewMode && "active")}
          title={previewMode ? "Edit mode" : "Preview markdown"}
          aria-label={previewMode ? "Switch to edit mode" : "Switch to preview mode"}
        >
          {previewMode ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          <span className="text-[10px] ml-1">{previewMode ? "Edit" : "Preview"}</span>
        </button>
      </div>

      {/* Notepad content area with lined paper */}
      <div className="notepad-body relative min-h-[650px]">
        {previewMode ? (
          <div className="notepad-preview min-h-[650px] w-full px-4 py-0 pl-[75px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || "*Start typing your note...*"}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            placeholder="Start typing your note..."
            className="notepad-textarea h-full min-h-[650px] w-full"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>

      {/* Author name — dedicated row at the bottom */}
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
  );
}
