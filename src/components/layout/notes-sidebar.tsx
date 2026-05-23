"use client";

import * as React from "react";
import {
  FileText,
  Plus,
  FolderPlus,
  ChevronLeft,
  ChevronRight,
  Menu,
  Trash2,
  LogOut,
  UserCircle,
  Loader2,
} from "lucide-react";
import { signOut } from "next-auth/react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { FolderList } from "./folder-list";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: Date;
  folderId?: string | null;
}

interface FolderWithCount {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { notes: number };
}

interface NotesSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedNoteId?: string | null;
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onDeleteNote: (id: string) => void;
  onOpenProfile: () => void;
  notes: Note[];
  isLoading?: boolean;
  // Folder-related props (optional for backward compatibility)
  folders?: FolderWithCount[];
  expandedFolders?: Set<string>;
  editingFolderId?: string | null;
  onToggleFolder?: (id: string) => void;
  onDeleteFolder?: (id: string) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onStartEditFolder?: (id: string) => void;
  onMoveToFolder?: (noteId: string, folderId: string | null) => void;
  onNewFolder?: () => void;
  isCreatingFolder?: boolean;
  onNewNoteInFolder?: (folderId: string) => void;
}

// ─── DraggableNoteItem ───────────────────────────────────────────────────────

interface DraggableNoteItemProps {
  note: Note;
  children: React.ReactNode;
}

function DraggableNoteItem({ note, children }: DraggableNoteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: note.id,
    data: { note },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-40")}
    >
      {children}
    </div>
  );
}

// ─── DroppableFolderTarget ───────────────────────────────────────────────────

interface DroppableFolderTargetProps {
  folderId: string;
  children: React.ReactNode;
}

function DroppableFolderTarget({ folderId, children }: DroppableFolderTargetProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: folderId,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-all duration-150 rounded",
        isOver && "ring-2 ring-amber-400/50 bg-white/5"
      )}
    >
      {children}
    </div>
  );
}

// ─── DroppableRootTarget ─────────────────────────────────────────────────────

interface DroppableRootTargetProps {
  children: React.ReactNode;
}

function DroppableRootTarget({ children }: DroppableRootTargetProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: "root-level",
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-all duration-150 rounded",
        isOver && "ring-2 ring-amber-400/50 bg-white/5"
      )}
    >
      {children}
    </div>
  );
}

// ─── NotesSidebar ────────────────────────────────────────────────────────────

export function NotesSidebar({
  isOpen,
  onToggle,
  selectedNoteId,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onOpenProfile,
  notes,
  isLoading,
  folders = [],
  expandedFolders = new Set<string>(),
  editingFolderId = null,
  onToggleFolder,
  onDeleteFolder,
  onRenameFolder,
  onStartEditFolder,
  onMoveToFolder,
  onNewFolder,
  isCreatingFolder = false,
  onNewNoteInFolder,
}: NotesSidebarProps) {
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [activeNote, setActiveNote] = React.useState<Note | null>(null);
  const [deleteFolderConfirmId, setDeleteFolderConfirmId] = React.useState<string | null>(null);

  // DnD sensor: require 8px of movement before starting a drag.
  // This allows normal clicks (select, delete) to work without being intercepted.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Resolve the folder being deleted for the confirmation dialog
  const deletingFolder = React.useMemo(
    () => folders.find((f) => f.id === deleteFolderConfirmId) ?? null,
    [folders, deleteFolderConfirmId]
  );

  const handleDeleteFolderRequest = (folderId: string) => {
    setDeleteFolderConfirmId(folderId);
  };

  const confirmDeleteFolder = () => {
    if (deleteFolderConfirmId && onDeleteFolder) {
      onDeleteFolder(deleteFolderConfirmId);
      setDeleteFolderConfirmId(null);
    }
  };

  const cancelDeleteFolder = () => {
    setDeleteFolderConfirmId(null);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut();
  };

  // ─── Drag handlers ──────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const note = event.active.data.current?.note as Note | undefined;
    if (note) {
      setActiveNote(note);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveNote(null);

    const { active, over } = event;
    if (!over) return;

    const draggedNote = active.data.current?.note as Note | undefined;
    if (!draggedNote) return;

    const noteId = draggedNote.id;
    const targetId = over.id as string;

    if (targetId === "root-level") {
      onMoveToFolder?.(noteId, null);
    } else {
      onMoveToFolder?.(noteId, targetId);
    }
  };

  const handleDragCancel = () => {
    setActiveNote(null);
  };

  // ─── Derived data ───────────────────────────────────────────────────────

  // Root-level notes: notes without a folder assignment
  const rootNotes = React.useMemo(
    () => notes.filter((note) => !note.folderId),
    [notes]
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={onToggle}
        className="btn-skeuomorphic fixed left-4 top-4 z-50 p-2 md:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          "leather-background sidebar-leather fixed left-0 top-0 z-40 flex h-full flex-col overflow-hidden",
          "transition-all duration-400 ease-in-out",
          isOpen ? "w-72" : "w-0 md:w-16"
        )}
      >
        {/* Sidebar Header */}
        <div
          className={cn(
            "flex items-center p-4 min-h-[60px]",
            isOpen ? "justify-between" : "justify-center"
          )}
        >
          {isOpen && (
            <h1 className="embossed-text text-base tracking-wide whitespace-nowrap">
              🖋️ My Writings
            </h1>
          )}
          <button
            onClick={onToggle}
            className="btn-skeuomorphic hidden p-2 md:block"
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isOpen ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>

        <Separator className="bg-white/10" />

        {/* New Note Button */}
        <div className={cn("p-3", !isOpen && "flex flex-col items-center gap-2")}>
          <Button
            onClick={onNewNote}
            className={cn(
              "btn-skeuomorphic gap-2",
              isOpen ? "w-full" : "w-auto p-2"
            )}
          >
            <Plus className="h-4 w-4" />
            {isOpen && <span>New Note</span>}
          </Button>
          {onNewFolder && (
            <Button
              onClick={onNewFolder}
              disabled={isCreatingFolder}
              className={cn(
                "btn-skeuomorphic gap-2",
                isOpen ? "w-full mt-2" : "w-auto p-2"
              )}
            >
              <FolderPlus className={cn("h-4 w-4", isCreatingFolder && "animate-pulse")} />
              {isOpen && <span>{isCreatingFolder ? "Creating..." : "New Folder"}</span>}
            </Button>
          )}
        </div>

        <Separator className="bg-white/10" />

        {/* Notes List with DnD */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="custom-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-2">
            <div className="space-y-2 py-2">
              {isLoading ? (
                <div className="p-4 text-center">
                  <span className="text-[#c8b89a] opacity-60">Loading...</span>
                </div>
              ) : (
                <>
                  {/* Folder List */}
                  {folders.length > 0 && onToggleFolder && onDeleteFolder && onRenameFolder && onStartEditFolder && (
                    <FolderList
                      folders={folders}
                      notes={notes}
                      selectedNoteId={selectedNoteId ?? null}
                      sidebarOpen={isOpen}
                      expandedFolders={expandedFolders}
                      editingFolderId={editingFolderId}
                      onToggleFolder={onToggleFolder}
                      onSelectNote={onSelectNote}
                      onDeleteNote={onDeleteNote}
                      onDeleteFolder={handleDeleteFolderRequest}
                      onRenameFolder={onRenameFolder}
                      onStartEditFolder={onStartEditFolder}
                      onNewNoteInFolder={onNewNoteInFolder}
                      renderNoteItem={(note, children) => (
                        <DraggableNoteItem key={note.id} note={note}>
                          {children}
                        </DraggableNoteItem>
                      )}
                      renderFolderWrapper={(folderId, children) => (
                        <DroppableFolderTarget key={folderId} folderId={folderId}>
                          {children}
                        </DroppableFolderTarget>
                      )}
                    />
                  )}

                  {/* Root-level notes */}
                  <DroppableRootTarget>
                    {rootNotes.length === 0 && folders.length === 0 ? (
                      <div className={cn("p-4 text-center", !isOpen && "hidden")}>
                        <span className="text-[#c8b89a] opacity-60 text-sm">
                          No notes yet. Click &quot;New Note&quot; to start!
                        </span>
                      </div>
                    ) : (
                      rootNotes.map((note) => (
                        <DraggableNoteItem key={note.id} note={note}>
                          <div
                            className={cn(
                              "note-item relative w-full p-3 text-left transition-all overflow-hidden",
                              selectedNoteId === note.id && "active",
                              !isOpen && "flex justify-center p-2"
                            )}
                          >
                            {isOpen ? (
                              <div className="flex items-start gap-1 w-full overflow-hidden">
                                <button
                                  onClick={() => onSelectNote(note.id)}
                                  className="min-w-0 flex-1 overflow-hidden text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 shrink-0 opacity-70" />
                                    <span className="truncate font-medium">
                                      {note.title || "Untitled"}
                                    </span>
                                  </div>
                                  <p className="mt-1 truncate text-xs opacity-60 pl-6">
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
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => onSelectNote(note.id)}
                                className="w-full text-center"
                              >
                                <FileText className="h-5 w-5 opacity-70" />
                              </button>
                            )}
                          </div>
                        </DraggableNoteItem>
                      ))
                    )}
                  </DroppableRootTarget>
                </>
              )}
            </div>
          </div>

          {/* Drag Overlay — ghost of dragged note */}
          <DragOverlay>
            {activeNote ? (
              <div className="note-item p-3 rounded shadow-lg opacity-90 pointer-events-none max-w-[250px]">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="truncate font-medium text-sm">
                    {activeNote.title || "Untitled"}
                  </span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Footer */}
        <Separator className="bg-white/10" />
        <div
          className={cn(
            "p-3",
            isOpen
              ? "flex items-center justify-between"
              : "flex flex-col items-center gap-2"
          )}
        >
          {isOpen && (
            <span className="embossed-text text-[10px] italic opacity-40">
              Where thoughts become words ✍️
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenProfile}
              className="btn-skeuomorphic p-2"
              aria-label="Profile"
              title="Profile"
            >
              <UserCircle className="h-4 w-4" />
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="btn-skeuomorphic p-2 disabled:opacity-50"
              aria-label="Logout"
              title="Logout"
            >
              {loggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Folder Delete Confirmation Dialog */}
      {deleteFolderConfirmId && deletingFolder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={cancelDeleteFolder}
          />
          <div className="settings-modal relative w-full max-w-sm">
            <div className="settings-modal-header px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-900/30 border border-red-700/40">
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h3 className="embossed-text text-sm font-bold uppercase tracking-wider">
                    Delete Folder
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[#c8b89a] opacity-60">
                    This action cannot be undone
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="typewriter-text text-sm text-[#c8b89a]">
                Are you sure you want to delete &ldquo;
                <span className="font-bold text-[#e0d4c0]">
                  {deletingFolder.name}
                </span>
                &rdquo;? Notes inside this folder will be moved to the root level.
              </p>
            </div>
            <div className="settings-modal-footer flex items-center justify-end gap-2 px-5 py-4">
              <button
                onClick={cancelDeleteFolder}
                className="btn-skeuomorphic px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFolder}
                autoFocus
                className="btn-skeuomorphic px-4 py-2 text-sm"
                style={{ background: "linear-gradient(180deg, #7a2828 0%, #5c1e1e 50%, #3d1414 100%)" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
