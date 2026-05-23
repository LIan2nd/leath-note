"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { Bot, Trash2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { NotesSidebar } from "./notes-sidebar";
import { NotepadContainer } from "./notepad-container";
import { AiChatPanel } from "./ai-chat-panel";
import { GuestNotepad } from "./guest-notepad";
import { ProfileCard } from "./profile-card";
import { LoginForm } from "~/components/auth/login-form";
import { api } from "~/trpc/react";
import { useKeyboardShortcuts } from "~/hooks/use-keyboard-shortcuts";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

/** Loading skeleton shown while session status is being determined */
function LoadingSkeleton() {
  return (
    <div className="wood-background min-h-screen flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="h-8 w-48 rounded bg-white/10" />
        <div className="h-[600px] w-full max-w-2xl rounded bg-white/5" />
      </div>
    </div>
  );
}

/** Guest mode layout: notepad on the left, login form on the right */
function GuestLayout() {
  return (
    <div className="wood-background min-h-screen">
      <main className="min-h-screen p-4 md:p-8">
        <div className="flex min-h-[calc(100vh-4rem)] flex-col items-start justify-center gap-6 pt-8 lg:flex-row">
          {/* Guest notepad — main area */}
          <div className="w-full flex-1 flex justify-center">
            <GuestNotepad />
          </div>
          {/* Login form — right side */}
          <div className="w-full lg:w-[380px] lg:min-w-[340px] shrink-0">
            <React.Suspense fallback={null}>
              <LoginForm />
            </React.Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Authenticated mode: full sidebar + notepad + chat (existing behavior) */
function AuthenticatedLayout() {
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [profileOpen, setProfileOpen] = React.useState(false);

  const [editTitle, setEditTitle] = React.useState("");
  const [editContent, setEditContent] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  // Folder state
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  const [editingFolderId, setEditingFolderId] = React.useState<string | null>(null);

  // Track the last-saved values so we only mutate on real changes
  const savedTitleRef = React.useRef("");
  const savedContentRef = React.useRef("");

  const utils = api.useUtils();

  // Single query — all note data lives here, no getById needed
  const { data: notes, isLoading: isLoadingNotes } = api.notes.list.useQuery();

  // Folder query
  const { data: folders } = api.folders.list.useQuery();

  // Derive the selected note directly from the cache — zero extra fetch
  const selectedNote = React.useMemo(
    () => notes?.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  const createNoteMutation = api.notes.create.useMutation({
    onSuccess: (newNote) => {
      // Add to cache optimistically
      utils.notes.list.setData(undefined, (old) =>
        old ? [newNote, ...old] : [newNote]
      );
      // Switch to the new note — editor sync will handle setting title/content
      handleSelectNote(newNote.id);
      void utils.notes.list.invalidate();
    },
  });

  const updateNoteMutation = api.notes.update.useMutation({
    onMutate: async ({ id, title, content }) => {
      // Optimistic update — patch the list cache immediately
      await utils.notes.list.cancel();
      const previous = utils.notes.list.getData();
      utils.notes.list.setData(undefined, (old) =>
        old?.map((n) =>
          n.id === id
            ? { ...n, ...(title !== undefined && { title }), ...(content !== undefined && { content }), updatedAt: new Date() }
            : n
        )
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back on error
      if (ctx?.previous) utils.notes.list.setData(undefined, ctx.previous);
      setIsSaving(false);
    },
    onSuccess: () => {
      setIsSaving(false);
      // Reorder sidebar (updatedAt changed) without a full refetch
      utils.notes.list.setData(undefined, (old) =>
        old
          ? [...old].sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )
          : old
      );
    },
  });

  const deleteNoteMutation = api.notes.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.notes.list.cancel();
      const previous = utils.notes.list.getData();
      utils.notes.list.setData(undefined, (old) => old?.filter((n) => n.id !== id));

      // If deleting the currently selected note, switch immediately
      if (selectedNoteId === id) {
        const remaining = previous?.filter((n) => n.id !== id);
        const nextId = remaining?.[0]?.id ?? null;
        setSelectedNoteId(nextId);
        if (nextId) {
          const nextNote = remaining?.find((n) => n.id === nextId);
          if (nextNote) {
            setEditTitle(nextNote.title);
            setEditContent(nextNote.content);
            savedTitleRef.current = nextNote.title;
            savedContentRef.current = nextNote.content;
          }
        } else {
          setEditTitle("");
          setEditContent("");
          savedTitleRef.current = "";
          savedContentRef.current = "";
        }
      }

      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.notes.list.setData(undefined, ctx.previous);
    },
    onSettled: () => {
      void utils.notes.list.invalidate();
    },
  });

  // ─── Folder Mutations ───────────────────────────────────────────────────

  const createFolderMutation = api.folders.create.useMutation({
    onSuccess: (newFolder) => {
      utils.folders.list.setData(undefined, (old) =>
        old
          ? [...old, newFolder].sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
            )
          : [newFolder]
      );
      setEditingFolderId(newFolder.id);
      setExpandedFolders((prev) => new Set([...prev, newFolder.id]));
    },
    onSettled: () => {
      void utils.folders.list.invalidate();
    },
  });

  const renameFolderMutation = api.folders.rename.useMutation({
    onMutate: async ({ id, name }) => {
      await utils.folders.list.cancel();
      const previous = utils.folders.list.getData();
      utils.folders.list.setData(undefined, (old) =>
        old?.map((f) => (f.id === id ? { ...f, name } : f))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.folders.list.setData(undefined, ctx.previous);
    },
    onSettled: () => {
      void utils.folders.list.invalidate();
    },
  });

  const deleteFolderMutation = api.folders.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.folders.list.cancel();
      const previousFolders = utils.folders.list.getData();
      utils.folders.list.setData(undefined, (old) =>
        old?.filter((f) => f.id !== id)
      );
      // Also optimistically move notes from this folder to root
      await utils.notes.list.cancel();
      const previousNotes = utils.notes.list.getData();
      utils.notes.list.setData(undefined, (old) =>
        old?.map((n) => (n.folderId === id ? { ...n, folderId: null } : n))
      );
      return { previousFolders, previousNotes };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousFolders) utils.folders.list.setData(undefined, ctx.previousFolders);
      if (ctx?.previousNotes) utils.notes.list.setData(undefined, ctx.previousNotes);
    },
    onSettled: () => {
      void utils.folders.list.invalidate();
      void utils.notes.list.invalidate();
    },
  });

  const moveToFolderMutation = api.notes.moveToFolder.useMutation({
    onMutate: async ({ noteId, folderId }) => {
      await utils.notes.list.cancel();
      const previous = utils.notes.list.getData();
      utils.notes.list.setData(undefined, (old) =>
        old?.map((n) => (n.id === noteId ? { ...n, folderId } : n))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.notes.list.setData(undefined, ctx.previous);
    },
    onSettled: () => {
      void utils.notes.list.invalidate();
      void utils.folders.list.invalidate();
    },
  });

  // Sync editor when selected note changes — instant from cache
  React.useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title);
      setEditContent(selectedNote.content);
      savedTitleRef.current = selectedNote.title;
      savedContentRef.current = selectedNote.content;
    } else {
      setEditTitle("");
      setEditContent("");
      savedTitleRef.current = "";
      savedContentRef.current = "";
    }
  }, [selectedNoteId]); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ intentionally depend on selectedNoteId (not selectedNote) to avoid re-syncing on cache updates

  // Auto-select first note on load
  React.useEffect(() => {
    if (!selectedNoteId && notes && notes.length > 0) {
      setSelectedNoteId(notes[0]!.id);
    }
  }, [notes, selectedNoteId]);

  const debouncedTitle = useDebounce(editTitle, 1000);
  const debouncedContent = useDebounce(editContent, 1000);

  // Auto-save — only fires when debounced value differs from what's saved
  // Uses a ref to track the note ID at the time of debounce to prevent cross-note saves
  const autoSaveNoteIdRef = React.useRef(selectedNoteId);
  autoSaveNoteIdRef.current = selectedNoteId;

  React.useEffect(() => {
    const noteId = autoSaveNoteIdRef.current;
    if (!noteId) return;
    const titleChanged = debouncedTitle !== savedTitleRef.current;
    const contentChanged = debouncedContent !== savedContentRef.current;
    if (!titleChanged && !contentChanged) return;

    savedTitleRef.current = debouncedTitle;
    savedContentRef.current = debouncedContent;
    setIsSaving(true);
    updateNoteMutation.mutate({
      id: noteId,
      title: debouncedTitle,
      content: debouncedContent,
    });
  }, [debouncedTitle, debouncedContent]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectNote = (id: string) => {
    if (id === selectedNoteId) return;

    // Before switching: if there are unsaved changes on the current note, save immediately
    if (selectedNoteId) {
      const titleChanged = editTitle !== savedTitleRef.current;
      const contentChanged = editContent !== savedContentRef.current;
      if (titleChanged || contentChanged) {
        savedTitleRef.current = editTitle;
        savedContentRef.current = editContent;
        updateNoteMutation.mutate({
          id: selectedNoteId,
          title: editTitle,
          content: editContent,
        });
      }
    }

    // Switch to new note — sync effect will populate editor from cache
    setSelectedNoteId(id);
  };

  const handleNewNote = () => {
    createNoteMutation.mutate({ title: "Untitled", content: "" });
  };

  const handleDeleteNote = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteNoteMutation.mutate({ id: deleteConfirmId });
      setDeleteConfirmId(null);
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts(
    React.useMemo(
      () => ({
        toggleSidebar: () => setSidebarOpen((p) => !p),
        toggleChat: () => setChatOpen((p) => !p),
        newNote: handleNewNote,
        closeModals: () => {
          if (deleteConfirmId) {
            setDeleteConfirmId(null);
          } else if (chatOpen) {
            setChatOpen(false);
          }
        },
        focusTitle: () => {
          document.querySelector<HTMLTextAreaElement>(".title-input")?.focus();
        },
        focusBody: () => {
          document.querySelector<HTMLTextAreaElement>(".notepad-textarea")?.focus();
        },
        prevNote: () => {
          if (!notes || notes.length === 0) return;
          const idx = notes.findIndex((n) => n.id === selectedNoteId);
          if (idx > 0) handleSelectNote(notes[idx - 1]!.id);
        },
        nextNote: () => {
          if (!notes || notes.length === 0) return;
          const idx = notes.findIndex((n) => n.id === selectedNoteId);
          if (idx < notes.length - 1) handleSelectNote(notes[idx + 1]!.id);
        },
        saveNow: () => {
          if (!selectedNoteId) return;
          const titleChanged = editTitle !== savedTitleRef.current;
          const contentChanged = editContent !== savedContentRef.current;
          if (titleChanged || contentChanged) {
            savedTitleRef.current = editTitle;
            savedContentRef.current = editContent;
            setIsSaving(true);
            updateNoteMutation.mutate({
              id: selectedNoteId,
              title: editTitle,
              content: editContent,
            });
          }
        },
      }),
      [deleteConfirmId, chatOpen, notes, selectedNoteId, editTitle, editContent] // eslint-disable-line react-hooks/exhaustive-deps
    )
  );

  return (
    <div className="wood-background min-h-screen">
      <NotesSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((p) => !p)}
        selectedNoteId={selectedNoteId}
        onSelectNote={handleSelectNote}
        onNewNote={handleNewNote}
        onDeleteNote={handleDeleteNote}
        onOpenProfile={() => setProfileOpen(true)}
        notes={notes ?? []}
        isLoading={isLoadingNotes}
        folders={folders ?? []}
        expandedFolders={expandedFolders}
        editingFolderId={editingFolderId}
        onToggleFolder={(id) =>
          setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onDeleteFolder={(id) => deleteFolderMutation.mutate({ id })}
        onRenameFolder={(id, name) => {
          setEditingFolderId(null);
          // Only call mutation if name actually changed
          const currentFolder = folders?.find((f) => f.id === id);
          if (currentFolder && currentFolder.name !== name) {
            renameFolderMutation.mutate({ id, name });
          }
        }}
        onStartEditFolder={(id) => setEditingFolderId(id)}
        onMoveToFolder={(noteId, folderId) =>
          moveToFolderMutation.mutate({ noteId, folderId })
        }
        onNewFolder={() => createFolderMutation.mutate({})}
      />

      <main
        className={cn(
          "min-h-screen p-4 transition-[margin] duration-500 ease-in-out md:p-8",
          sidebarOpen ? "md:ml-72" : "md:ml-16"
        )}
      >
        <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center pt-8">
          <NotepadContainer
            noteId={selectedNoteId}
            title={editTitle}
            content={editContent}
            createdAt={selectedNote?.createdAt ?? null}
            onTitleChange={setEditTitle}
            onContentChange={setEditContent}
            isSaving={isSaving || updateNoteMutation.isPending}
            authorName={session?.user?.name ?? null}
          />
        </div>
      </main>

      <button
        onClick={() => setChatOpen((p) => !p)}
        className={cn("chat-toggle-btn", chatOpen && "active")}
        aria-label={chatOpen ? "Close AI chat" : "Open AI chat"}
        title="AI Assistant"
      >
        <Bot className="h-6 w-6" />
      </button>

      <AiChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        noteContent={editContent}
        noteTitle={editTitle}
        noteId={selectedNoteId}
        userName={session?.user?.name}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDeleteConfirmId(null)}
          />
          <div className="settings-modal relative w-full max-w-sm">
            <div className="settings-modal-header px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-900/30 border border-red-700/40">
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h3 className="embossed-text text-sm font-bold uppercase tracking-wider">
                    Delete Note
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
                  {notes?.find((n) => n.id === deleteConfirmId)?.title || "Untitled"}
                </span>
                &rdquo;? All chat history for this note will also be removed.
              </p>
            </div>
            <div className="settings-modal-footer flex items-center justify-end gap-2 px-5 py-4">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="btn-skeuomorphic px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
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

      {/* Profile Card */}
      <ProfileCard isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

export function MainLayout() {
  const { status } = useSession();

  if (status === "loading") {
    return <LoadingSkeleton />;
  }

  if (status === "unauthenticated") {
    return <GuestLayout />;
  }

  return <AuthenticatedLayout />;
}
