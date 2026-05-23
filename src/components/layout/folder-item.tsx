"use client";

import * as React from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Trash2,
  FileText,
} from "lucide-react";
import { cn } from "~/lib/utils";

interface FolderWithCount {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { notes: number };
}

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: Date;
  folderId?: string | null;
}

interface FolderItemProps {
  folder: FolderWithCount;
  notes: Note[];
  isExpanded: boolean;
  isEditing: boolean;
  sidebarOpen: boolean;
  selectedNoteId: string | null;
  onToggle: () => void;
  onSelectNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onStartEdit: () => void;
  onNewNote?: () => void;
  /** Render prop to wrap each note item with a draggable wrapper */
  renderNoteItem?: (note: Note, children: React.ReactNode) => React.ReactNode;
}

export function FolderItem({
  folder,
  notes,
  isExpanded,
  isEditing,
  sidebarOpen,
  selectedNoteId,
  onToggle,
  onSelectNote,
  onDeleteNote,
  onDelete,
  onRename,
  onStartEdit,
  onNewNote,
  renderNoteItem,
}: FolderItemProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = React.useState(folder.name);

  // When entering edit mode, sync the input value and select all text
  React.useEffect(() => {
    if (isEditing) {
      setEditValue(folder.name);
      // Use a microtask to ensure the input is rendered before focusing
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      });
    }
  }, [isEditing, folder.name]);

  const handleSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed.length === 0) {
      // Revert to previous name on empty/whitespace submission
      setEditValue(folder.name);
      onRename(folder.name);
    } else {
      onRename(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Revert on Escape
      setEditValue(folder.name);
      onRename(folder.name);
    }
  };

  const handleBlur = () => {
    handleSubmit();
  };

  // Collapsed sidebar: show folder icon with hover flyout panel
  if (!sidebarOpen) {
    return (
      <div className="folder-flyout-trigger group relative">
        <div className="note-item flex justify-center p-2">
          <button
            onClick={onToggle}
            className="w-full text-center"
            aria-label={`Folder: ${folder.name}`}
            title={folder.name}
          >
            {isExpanded ? (
              <FolderOpen className="h-5 w-5 opacity-70 mx-auto" />
            ) : (
              <Folder className="h-5 w-5 opacity-70 mx-auto" />
            )}
          </button>
        </div>

        {/* Flyout panel: shows folder name + notes inside */}
        <div className="folder-flyout pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto">
          <div className="folder-flyout-header">
            <Folder className="h-4 w-4 opacity-70 shrink-0" />
            <span className="truncate font-medium text-sm">{folder.name}</span>
            <span className="ml-auto text-[10px] opacity-60 bg-white/10 rounded-full px-1.5 py-0.5 min-w-[20px] text-center shrink-0">
              {folder._count.notes}
            </span>
          </div>

          <div className="folder-flyout-body">
            {notes.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-[#c8b89a] opacity-60 italic">
                Empty folder
              </div>
            ) : (
              notes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className={cn(
                    "folder-flyout-note w-full text-left",
                    selectedNoteId === note.id && "active"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate text-sm">
                      {note.title || "Untitled"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] opacity-60 pl-5">
                    {note.content?.slice(0, 50) || "Empty note..."}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Folder header row — entire row is clickable to toggle */}
      <div
        onClick={!isEditing ? onToggle : undefined}
        className={cn(
          "note-item relative w-full p-3 text-left transition-all overflow-hidden cursor-pointer",
          isExpanded && "active"
        )}
      >
        <div className="flex items-center gap-1 w-full overflow-hidden">
          {/* Expand/collapse chevron icon */}
          <span className="shrink-0 p-0.5">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            )}
          </span>

          {/* Folder icon */}
          <span className="shrink-0">
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 opacity-70" />
            ) : (
              <Folder className="h-4 w-4 opacity-70" />
            )}
          </span>

          {/* Folder name or inline edit input */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onClick={(e) => e.stopPropagation()}
              maxLength={50}
              className="min-w-0 flex-1 bg-black/30 border border-white/20 rounded px-1.5 py-0.5 text-sm text-[#e0d4c0] outline-none focus:border-white/40"
              aria-label="Rename folder"
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                onStartEdit();
              }}
              className="min-w-0 flex-1 overflow-hidden text-left"
            >
              <span className="truncate font-medium text-sm block">
                {folder.name}
              </span>
            </span>
          )}

          {/* Note count badge */}
          {!isEditing && (
            <span className="shrink-0 text-[10px] opacity-60 bg-white/10 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {folder._count.notes}
            </span>
          )}

          {/* Delete button */}
          {!isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete();
              }}
              className="shrink-0 rounded p-1"
              aria-label={`Delete folder ${folder.name}`}
              style={{ color: "#ef4444" }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded folder contents */}
      {isExpanded && (
        <div className="ml-4 border-l border-white/10 pl-2 space-y-1 py-1">
          {notes.length === 0 ? (
            <button
              onClick={onNewNote}
              className="w-full px-3 py-2 text-[11px] text-[#c8b89a] opacity-60 hover:opacity-100 italic text-left transition-opacity flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Add a note</span>
            </button>
          ) : (
            notes.map((note) => {
              const noteContent = (
                <div
                  key={note.id}
                  className={cn(
                    "note-item relative w-full p-2 text-left transition-all overflow-hidden",
                    selectedNoteId === note.id && "active"
                  )}
                >
                  <div className="flex items-start gap-1 w-full overflow-hidden">
                    <button
                      onClick={() => onSelectNote(note.id)}
                      className="min-w-0 flex-1 overflow-hidden text-left"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span className="truncate font-medium text-sm">
                          {note.title || "Untitled"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] opacity-60 pl-5">
                        {note.content?.slice(0, 50) || "Empty note..."}
                      </p>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onDeleteNote(note.id);
                      }}
                      className="shrink-0 rounded p-1 mt-0.5"
                      aria-label={`Delete ${note.title || "note"}`}
                      style={{ color: "#ef4444" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );

              return renderNoteItem
                ? renderNoteItem(note, noteContent)
                : noteContent;
            })
          )}
        </div>
      )}
    </div>
  );
}
