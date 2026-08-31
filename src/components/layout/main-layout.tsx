"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Trash2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { ProfileCard } from "./profile-card";
import { api } from "~/trpc/react";
import { useKeyboardShortcuts } from "~/hooks/use-keyboard-shortcuts";
import { useModalFocus } from "~/hooks/use-modal-focus";
import { ActionErrorMessage } from "~/components/ui/action-error-message";
import { AsyncStatusMessage } from "~/components/ui/async-status-message";

const NotepadContainer = dynamic(
  () => import("./notepad-container").then((module) => module.NotepadContainer),
  { ssr: false },
);

const NotesSidebar = dynamic(
  () => import("./notes-sidebar").then((module) => module.NotesSidebar),
  { ssr: false },
);

const AiChatPanel = dynamic(
  () => import("./ai-chat-panel").then((module) => module.AiChatPanel),
  { ssr: false },
);

const SESSION_LOADING_MESSAGES = [
  "Checking your session...",
  "The sign-in service is taking a little longer to respond. Please keep this page open.",
] as const;

const SIGN_IN_RETURN_MESSAGES = [
  "Returning you to the sign-in page...",
  "This transition is taking a little longer than usual. Your guest scratchpad will be ready shortly.",
] as const;

const NOTE_SAVE_ERROR =
  "Your latest changes could not be saved. Press Ctrl+S to retry.";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function AuthenticatedLayout() {
  const router = useRouter();
  const { status } = useSession();

  React.useEffect(() => {
    if (status === "unauthenticated") router.refresh();
  }, [router, status]);

  if (status !== "authenticated") {
    return (
      <div className="wood-background flex min-h-screen items-center justify-center px-4">
        <AsyncStatusMessage
          active
          appearanceDelayMs={0}
          messages={status === "loading" ? SESSION_LOADING_MESSAGES : SIGN_IN_RETURN_MESSAGES}
          className="w-full max-w-sm"
        />
      </div>
    );
  }

  return <AuthenticatedWorkspace />;
}

/** Authenticated mode: full sidebar + notepad + chat. */
function AuthenticatedWorkspace() {
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatMounted, setChatMounted] = React.useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const deleteDialogRef = useModalFocus(Boolean(deleteConfirmId));
  const [profileOpen, setProfileOpen] = React.useState(false);

  const [editTitle, setEditTitle] = React.useState("");
  const [editContent, setEditContent] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [operationError, setOperationError] = React.useState<string | null>(null);

  // Folder state
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  const [editingFolderId, setEditingFolderId] = React.useState<string | null>(null);

  // Track the last-saved values so we only mutate on real changes
  const savedTitleRef = React.useRef("");
  const savedContentRef = React.useRef("");

  const utils = api.useUtils();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const syncSidebarWithViewport = (isDesktop: boolean) => setSidebarOpen(isDesktop);
    syncSidebarWithViewport(desktopQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => syncSidebarWithViewport(event.matches);
    desktopQuery.addEventListener("change", handleChange);
    return () => desktopQuery.removeEventListener("change", handleChange);
  }, []);

  // Track IDs being deleted to prevent them from reappearing during refetch
  const pendingNoteDeletes = React.useRef(new Set<string>());
  const pendingFolderDeletes = React.useRef(new Set<string>());

  // Single query — all note data lives here, no getById needed
  const {
    data: rawNotes,
    error: notesQueryError,
    isLoading: isLoadingNotes,
  } = api.notes.list.useQuery();

  // Folder query
  const {
    data: rawFolders,
    error: foldersQueryError,
    isLoading: isLoadingFolders,
  } = api.folders.list.useQuery();
  const isLoadingWorkspace = isLoadingNotes || isLoadingFolders;

  React.useEffect(() => {
    if (notesQueryError || foldersQueryError) {
      setOperationError("Some of your notes could not be loaded. Please refresh and try again.");
    }
  }, [foldersQueryError, notesQueryError]);

  // Filter out items that are pending deletion (prevents reappearing on refetch)
  const notes = React.useMemo(
    () => rawNotes?.filter((n) => !pendingNoteDeletes.current.has(n.id)),
    [rawNotes]
  );
  const folders = React.useMemo(
    () => rawFolders?.filter((f) => !pendingFolderDeletes.current.has(f.id)),
    [rawFolders]
  );

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
      // Switch to the new note — set content directly since cache hasn't re-rendered yet
      handleSelectNoteWithData(newNote.id, newNote.title, newNote.content);
      void utils.notes.list.invalidate();
      void utils.folders.list.invalidate();
    },
    onError: () => setOperationError("Could not create the note. Please try again."),
  });

  const updateNoteMutation = api.notes.update.useMutation({
    scope: { id: "note-updates" },
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
    onError: (_err, { id }, ctx) => {
      // A late failed save must never resurrect a note being deleted.
      if (!pendingNoteDeletes.current.has(id) && ctx?.previous) {
        utils.notes.list.setData(undefined, ctx.previous);
      }
      if (selectedNoteId === id) {
        const previousNote = ctx?.previous?.find((note) => note.id === id);
        if (previousNote) {
          savedTitleRef.current = previousNote.title;
          savedContentRef.current = previousNote.content;
        }
      }
      setIsSaving(false);
      setOperationError(NOTE_SAVE_ERROR);
    },
    onSuccess: () => {
      setIsSaving(false);
      setOperationError((current) =>
        current === NOTE_SAVE_ERROR ? null : current,
      );
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
      pendingNoteDeletes.current.add(id);
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

      const deletedNote = previous?.find((note) => note.id === id);
      return { previous, deletedNote, wasSelected: selectedNoteId === id };
    },
    onError: (_err, { id }, ctx) => {
      pendingNoteDeletes.current.delete(id);
      if (ctx?.previous) utils.notes.list.setData(undefined, ctx.previous);
      if (ctx?.wasSelected && ctx.deletedNote) {
        setSelectedNoteId(ctx.deletedNote.id);
        setEditTitle(ctx.deletedNote.title);
        setEditContent(ctx.deletedNote.content);
        savedTitleRef.current = ctx.deletedNote.title;
        savedContentRef.current = ctx.deletedNote.content;
      }
      setOperationError("Could not delete the note. It has been restored.");
    },
    onSuccess: (_data, { id }) => {
      pendingNoteDeletes.current.delete(id);
    },
    onSettled: () => {
      // Only invalidate if no more pending deletes — prevents reappearing items
      if (pendingNoteDeletes.current.size === 0) {
        void utils.notes.list.invalidate();
        void utils.folders.list.invalidate();
      }
    },
  });

  // ─── Folder Mutations ───────────────────────────────────────────────────

  const createFolderMutation = api.folders.create.useMutation({
    onMutate: async () => {
      // Cancel outgoing refetches
      await utils.folders.list.cancel();
      const previous = utils.folders.list.getData();

      // Optimistic update: add a temporary folder immediately
      const tempId = `temp-${Date.now()}`;
      const tempFolder = {
        id: tempId,
        name: "Untitled Folder",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "",
        _count: { notes: 0 },
      };
      utils.folders.list.setData(undefined, (old) =>
        old ? [...old, tempFolder] : [tempFolder]
      );

      return { previous, tempId };
    },
    onSuccess: (newFolder, _vars, context) => {
      // Replace the temp folder with the real one
      utils.folders.list.setData(undefined, (old) =>
        old
          ? old
              .map((f) => (f.id === context?.tempId ? newFolder : f))
              .sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
              )
          : [newFolder]
      );
      setEditingFolderId(newFolder.id);
      setExpandedFolders((prev) => new Set([...prev, newFolder.id]));
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        utils.folders.list.setData(undefined, context.previous);
      }
      setOperationError("Could not create the folder. Please try again.");
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
      setOperationError("Could not rename the folder. The previous name was restored.");
    },
    onSettled: () => {
      void utils.folders.list.invalidate();
    },
  });

  const deleteFolderMutation = api.folders.delete.useMutation({
    onMutate: async ({ id }) => {
      pendingFolderDeletes.current.add(id);
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
    onError: (_err, { id }, ctx) => {
      pendingFolderDeletes.current.delete(id);
      if (ctx?.previousFolders) utils.folders.list.setData(undefined, ctx.previousFolders);
      if (ctx?.previousNotes) utils.notes.list.setData(undefined, ctx.previousNotes);
      setOperationError("Could not delete the folder. It has been restored.");
    },
    onSuccess: (_data, { id }) => {
      pendingFolderDeletes.current.delete(id);
    },
    onSettled: () => {
      // Only invalidate if no more pending deletes
      if (pendingFolderDeletes.current.size === 0) {
        void utils.folders.list.invalidate();
        void utils.notes.list.invalidate();
      }
    },
  });

  const moveToFolderMutation = api.notes.moveToFolder.useMutation({
    onMutate: async ({ noteId, folderId }) => {
      await Promise.all([utils.notes.list.cancel(), utils.folders.list.cancel()]);
      const previous = utils.notes.list.getData();
      const previousFolders = utils.folders.list.getData();
      const previousFolderId = previous?.find((note) => note.id === noteId)?.folderId ?? null;
      utils.notes.list.setData(undefined, (old) =>
        old?.map((n) => (n.id === noteId ? { ...n, folderId } : n))
      );
      utils.folders.list.setData(undefined, (old) =>
        old?.map((folder) => {
          if (folder.id === previousFolderId) {
            return {
              ...folder,
              _count: { notes: Math.max(0, folder._count.notes - 1) },
            };
          }
          if (folder.id === folderId) {
            return { ...folder, _count: { notes: folder._count.notes + 1 } };
          }
          return folder;
        })
      );
      return { previous, previousFolders };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.notes.list.setData(undefined, ctx.previous);
      if (ctx?.previousFolders) utils.folders.list.setData(undefined, ctx.previousFolders);
      setOperationError("Could not move the note. Its previous location was restored.");
    },
    onSettled: () => {
      void utils.notes.list.invalidate();
      void utils.folders.list.invalidate();
    },
  });

  // Select a valid note on load and recover if the selected note disappears
  // after a refetch (for example, it was deleted in another browser tab).
  React.useEffect(() => {
    if (!notes) return;
    if (selectedNoteId && notes.some((note) => note.id === selectedNoteId)) return;

    const firstNote = notes[0];
    setSelectedNoteId(firstNote?.id ?? null);
    setEditTitle(firstNote?.title ?? "");
    setEditContent(firstNote?.content ?? "");
    savedTitleRef.current = firstNote?.title ?? "";
    savedContentRef.current = firstNote?.content ?? "";
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

    // Switch to new note — set content synchronously so NotepadContainer
    // mounts with the correct content (key={noteId} causes remount)
    const nextNote = notes?.find((n) => n.id === id);
    if (nextNote) {
      setEditTitle(nextNote.title);
      setEditContent(nextNote.content);
      savedTitleRef.current = nextNote.title;
      savedContentRef.current = nextNote.content;
    } else {
      setEditTitle("");
      setEditContent("");
      savedTitleRef.current = "";
      savedContentRef.current = "";
    }
    setSelectedNoteId(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  /** Switch to a note when we already have its data (e.g. from mutation response) */
  const handleSelectNoteWithData = (id: string, noteTitle: string, noteContent: string) => {
    if (id === selectedNoteId) return;

    // Save current note if needed
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

    setEditTitle(noteTitle);
    setEditContent(noteContent);
    savedTitleRef.current = noteTitle;
    savedContentRef.current = noteContent;
    setSelectedNoteId(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleNewNote = () => {
    if (createNoteMutation.isPending) return;
    createNoteMutation.mutate({ title: "Untitled", content: "" });
  };

  const handleNewNoteInFolder = (folderId: string) => {
    if (createNoteMutation.isPending) return;
    createNoteMutation.mutate({ title: "Untitled", content: "", folderId });
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

  const toggleChat = React.useCallback(() => {
    setChatMounted(true);
    setChatOpen((open) => !open);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts(
    React.useMemo(
      () => ({
        toggleSidebar: () => setSidebarOpen((p) => !p),
        toggleChat,
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
          document.querySelector<HTMLElement>(".notepad-editor")?.focus();
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
      [deleteConfirmId, chatOpen, notes, selectedNoteId, editTitle, editContent, toggleChat] // eslint-disable-line react-hooks/exhaustive-deps
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
        isCreatingNote={createNoteMutation.isPending}
        onDeleteNote={handleDeleteNote}
        onOpenProfile={() => setProfileOpen(true)}
        onLogout={async () => {
          // Prevent one account's cached notes from flashing for the next
          // account that signs in in the same browser tab.
          await signOut({ redirect: false });
          queryClient.clear();
        }}
        notes={notes ?? []}
        isLoading={isLoadingWorkspace}
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
        onNewFolder={() => {
          if (!createFolderMutation.isPending) createFolderMutation.mutate({});
        }}
        isCreatingFolder={createFolderMutation.isPending}
        onNewNoteInFolder={handleNewNoteInFolder}
      />

      <main
        aria-busy={isLoadingWorkspace}
        className={cn(
          "min-h-screen p-2 pt-20 transition-[margin] duration-150 ease-out sm:p-4 sm:pt-20 md:p-8 md:pt-8",
          sidebarOpen ? "md:ml-72" : "md:ml-16"
        )}
      >
        <h1 className="sr-only">Leath Notes writing space</h1>
        <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center md:pt-8">
          <NotepadContainer
            key={selectedNoteId ?? "no-note"}
            noteId={selectedNoteId}
            title={editTitle}
            content={editContent}
            createdAt={selectedNote?.createdAt ?? null}
            onTitleChange={setEditTitle}
            onContentChange={setEditContent}
            onCreateNote={handleNewNote}
            isCreatingNote={createNoteMutation.isPending}
            isLoading={isLoadingWorkspace}
            hasUnsavedChanges={
              Boolean(selectedNoteId) &&
              (editTitle !== savedTitleRef.current || editContent !== savedContentRef.current)
            }
            isSaving={isSaving || updateNoteMutation.isPending}
            authorName={session?.user?.name ?? null}
          />
        </div>
      </main>

      <button
        onClick={toggleChat}
        className={cn("chat-toggle-btn", chatOpen && "active")}
        aria-label={chatOpen ? "Close AI chat" : "Open AI chat"}
        title="AI Assistant"
      >
        <Bot className="h-6 w-6" />
      </button>

      {chatMounted && (
        <AiChatPanel
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          noteTitle={editTitle}
          noteId={selectedNoteId}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDeleteConfirmId(null)}
          />
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-note-title"
            className="settings-modal relative w-full max-w-sm"
          >
            <div className="settings-modal-header px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-900/30 border border-red-700/40">
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h3 id="delete-note-title" className="embossed-text text-sm font-bold uppercase tracking-wider">
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
                autoFocus
                className="btn-skeuomorphic px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
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

      {operationError && (
        <ActionErrorMessage
          title="Leath Notes needs your attention"
          message={operationError}
          className="fixed bottom-4 left-1/2 z-70 w-[min(92vw,32rem)] -translate-x-1/2 shadow-xl"
          action={(
            <button
              type="button"
              onClick={() => setOperationError(null)}
              className="btn-skeuomorphic px-2 py-1 text-xs"
            >
              Dismiss
            </button>
          )}
        />
      )}
    </div>
  );
}
