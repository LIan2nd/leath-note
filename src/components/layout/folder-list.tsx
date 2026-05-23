"use client";

import * as React from "react";
import { FolderItem } from "./folder-item";
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

interface FolderListProps {
  folders: FolderWithCount[];
  notes: Note[];
  selectedNoteId: string | null;
  sidebarOpen: boolean;
  expandedFolders: Set<string>;
  editingFolderId: string | null;
  onToggleFolder: (id: string) => void;
  onSelectNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onStartEditFolder: (id: string) => void;
  /** Render prop to wrap each note item with a draggable wrapper */
  renderNoteItem?: (note: Note, children: React.ReactNode) => React.ReactNode;
  /** Render prop to wrap each folder with a droppable wrapper */
  renderFolderWrapper?: (folderId: string, children: React.ReactNode) => React.ReactNode;
}

export function FolderList({
  folders,
  notes,
  selectedNoteId,
  sidebarOpen,
  expandedFolders,
  editingFolderId,
  onToggleFolder,
  onSelectNote,
  onDeleteNote,
  onDeleteFolder,
  onRenameFolder,
  onStartEditFolder,
  renderNoteItem,
  renderFolderWrapper,
}: FolderListProps) {
  // Requirement 5.8: When user has no folders, render nothing
  if (folders.length === 0) {
    return null;
  }

  // Requirement 5.2: Sort folders alphabetically (case-insensitive)
  const sortedFolders = [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  return (
    <div className={cn("space-y-1", !sidebarOpen && "space-y-0")}>
      {sortedFolders.map((folder) => {
        // Requirement 5.3: Notes within a folder sorted by updatedAt descending
        const folderNotes = notes
          .filter((note) => note.folderId === folder.id)
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );

        const folderContent = (
          <FolderItem
            key={folder.id}
            folder={folder}
            notes={folderNotes}
            isExpanded={expandedFolders.has(folder.id)}
            isEditing={editingFolderId === folder.id}
            sidebarOpen={sidebarOpen}
            selectedNoteId={selectedNoteId}
            onToggle={() => onToggleFolder(folder.id)}
            onSelectNote={onSelectNote}
            onDeleteNote={onDeleteNote}
            onDelete={() => onDeleteFolder(folder.id)}
            onRename={(name: string) => onRenameFolder(folder.id, name)}
            onStartEdit={() => onStartEditFolder(folder.id)}
            renderNoteItem={renderNoteItem}
          />
        );

        return renderFolderWrapper
          ? renderFolderWrapper(folder.id, folderContent)
          : <React.Fragment key={folder.id}>{folderContent}</React.Fragment>;
      })}
    </div>
  );
}
