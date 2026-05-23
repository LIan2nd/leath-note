"use client";

import * as React from "react";
import { Bot, Send, X, Loader2, Sparkles, RotateCcw, Settings } from "lucide-react";
import { cn } from "~/lib/utils";
import {
  loadAiSettings,
  saveAiSettings,
  getProvider,
  isAiConfigured,
  type AiSettings,
} from "~/lib/ai-providers";
import { AiSettingsModal } from "./ai-settings-modal";
import { api } from "~/trpc/react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  noteContent: string;
  noteTitle: string;
  noteId: string | null;
}

/**
 * Tracks active background streams per note.
 * Streams continue even when user switches notes.
 * Key = noteId, Value = { abort, onToken callbacks }
 */
const activeStreams = new Map<string, { abort: AbortController; content: string }>();

export function AiChatPanel({
  isOpen,
  onClose,
  noteContent,
  noteTitle,
  noteId,
}: AiChatPanelProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  // Initialize with env defaults (SSR-safe), then hydrate from localStorage
  const [aiSettings, setAiSettings] = React.useState<AiSettings>(() => {
    if (typeof window === "undefined") return loadAiSettings();
    return loadAiSettings();
  });
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate settings from localStorage after mount to avoid SSR mismatch
  React.useEffect(() => {
    setAiSettings(loadAiSettings());
    setHydrated(true);
  }, []);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const provider = aiSettings.providerId ? getProvider(aiSettings.providerId) : null;
  const utils = api.useUtils();

  // Load chat history from DB when noteId changes
  const { data: savedMessages, isLoading: isLoadingChat } = api.chat.getByNoteId.useQuery(
    { noteId: noteId! },
    { enabled: !!noteId, refetchInterval: isStreaming ? 2000 : false }
  );

  // Sync DB messages into local state when savedMessages changes
  React.useEffect(() => {
    if (!noteId) {
      setMessages([]);
      return;
    }

    if (savedMessages) {
      const dbMessages: Message[] = savedMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // If there's an active stream for this note, append the streaming message
      const stream = activeStreams.get(noteId);
      if (stream && stream.content) {
        setMessages([...dbMessages, { role: "assistant", content: stream.content }]);
      } else if (stream && !stream.content) {
        // Stream just started, show thinking indicator
        setMessages([...dbMessages, { role: "assistant", content: "" }]);
      } else {
        setMessages(dbMessages);
      }
    }

    // Check if there's an active stream for the current note
    setIsStreaming(activeStreams.has(noteId));
    setError(null);
  }, [savedMessages, noteId]);

  // Ref to always have current noteId (avoids stale closures in async functions)
  const currentNoteIdRef = React.useRef(noteId);
  currentNoteIdRef.current = noteId;

  // tRPC mutations
  const addMessageMutation = api.chat.addMessage.useMutation();
  const clearChatMutation = api.chat.clearByNoteId.useMutation({
    onSuccess: () => {
      if (noteId) void utils.chat.getByNoteId.invalidate({ noteId });
    },
  });

  // Scroll to bottom
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  React.useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  // Poll for stream updates when viewing a note with active stream
  React.useEffect(() => {
    if (!noteId || !activeStreams.has(noteId)) return;

    const interval = setInterval(() => {
      const stream = activeStreams.get(noteId);
      if (!stream) {
        setIsStreaming(false);
        clearInterval(interval);
        return;
      }
      // Update the last message with current stream content
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, content: stream.content };
        }
        return updated;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [noteId, isStreaming]);

  const handleSaveSettings = (newSettings: AiSettings) => {
    saveAiSettings(newSettings);
    setAiSettings(newSettings);
  };

  const handleResetSettings = () => {
    if (typeof window !== "undefined") localStorage.removeItem("leath-notes:ai-settings");
    setAiSettings(loadAiSettings());
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !noteId) return;

    // Don't allow sending if this note already has an active stream
    if (activeStreams.has(noteId)) return;

    if (needsSetup) {
      setError("Please configure your AI provider first. Click ⚙️ to set up.");
      return;
    }

    if (provider?.requiresApiKey && !aiSettings.apiKey) {
      setError(`${provider.label} requires an API key. Click ⚙️ to configure.`);
      return;
    }

    setError(null);
    setInput("");

    // Optimistically show user message + empty assistant bubble
    setMessages((prev) => [...prev, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    // Capture everything needed before any async work (noteId could change)
    const targetNoteId = noteId;
    const chatHistory = [...messages];
    const currentNoteContent = noteContent;
    const currentSettings = { ...aiSettings };

    // Save user message to DB (fire-and-forget, don't block stream start)
    addMessageMutation.mutate({ noteId: targetNoteId, role: "user", content: trimmed });

    // Start stream immediately — don't wait for DB save
    void startBackgroundStream(
      targetNoteId,
      trimmed,
      chatHistory,
      noteTitle,
      currentNoteContent,
      currentSettings
    );
  };

  const startBackgroundStream = async (
    targetNoteId: string,
    userPrompt: string,
    chatHistory: Message[],
    title: string,
    content: string,
    settings: AiSettings
  ) => {
    const abortController = new AbortController();
    activeStreams.set(targetNoteId, { abort: abortController, content: "" });

    if (currentNoteIdRef.current === targetNoteId) setIsStreaming(true);

    let fullResponse = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          noteTitle: title,
          noteContent: content,
          userPrompt,
          chatHistory,
          providerId: settings.providerId,
          model: settings.model,
          apiKey: settings.apiKey,
          ollamaHost: settings.ollamaHost,
          customBaseUrl: settings.customBaseUrl,
        }),
      });

      if (!response.ok) {
        const errData = (await response.json()) as { error?: string };
        throw new Error(errData.error ?? "Failed to get response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { content?: string };
            if (parsed.content) {
              fullResponse += parsed.content;
              const stream = activeStreams.get(targetNoteId);
              if (stream) stream.content = fullResponse;
            }
          } catch { /* skip */ }
        }
      }

      // Save complete response to DB
      if (fullResponse) {
        addMessageMutation.mutate({ noteId: targetNoteId, role: "assistant", content: fullResponse });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (fullResponse) {
          addMessageMutation.mutate({ noteId: targetNoteId, role: "assistant", content: fullResponse });
        }
      } else {
        if (currentNoteIdRef.current === targetNoteId) {
          setError(err instanceof Error ? err.message : "Something went wrong");
          setMessages((prev) =>
            prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev
          );
        }
      }
    } finally {
      activeStreams.delete(targetNoteId);
      // Always invalidate the target note's chat cache so it loads from DB next time
      void utils.chat.getByNoteId.invalidate({ noteId: targetNoteId });
      // If user is still viewing this note, update streaming state
      if (currentNoteIdRef.current === targetNoteId) {
        setIsStreaming(false);
      }
    }
  };

  const handleStop = () => {
    if (!noteId) return;
    const stream = activeStreams.get(noteId);
    if (stream) stream.abort.abort();
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
    if (noteId) {
      // Also abort any active stream for this note
      const stream = activeStreams.get(noteId);
      if (stream) stream.abort.abort();
      clearChatMutation.mutate({ noteId });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    // Grow up to 120px max, then scroll internally
    const maxH = 120;
    if (el.scrollHeight > maxH) {
      el.style.height = `${maxH}px`;
      el.style.overflowY = "auto";
    } else {
      el.style.height = `${el.scrollHeight}px`;
      el.style.overflowY = "hidden";
    }
  };

  const needsSetup = !isAiConfigured(aiSettings);
  const hasActiveStream = noteId ? activeStreams.has(noteId) : false;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} />
      )}

      <AiSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={aiSettings}
        onSave={handleSaveSettings}
        onReset={handleResetSettings}
      />

      <div
        className={cn(
          "chat-panel fixed bottom-0 right-0 z-50 flex flex-col transition-all duration-300 ease-in-out",
          "h-[540px] w-full md:w-[380px]",
          isOpen
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
        )}
      >
        {/* Panel Header */}
        <div className="chat-panel-header flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="chat-ai-icon shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="embossed-text text-sm font-bold uppercase tracking-wider">
                AI Assistant
              </h3>
              <p className="text-[10px] text-[#c8b89a] opacity-60 truncate max-w-[180px]">
                {noteTitle || "Untitled Note"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                className="btn-skeuomorphic p-1.5"
                title="Clear chat"
                aria-label="Clear chat history"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              className={cn(
                "btn-skeuomorphic p-1.5",
                needsSetup && "ring-1 ring-amber-500/60"
              )}
              title="AI Settings"
              aria-label="Open AI settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="btn-skeuomorphic p-1.5"
              aria-label="Close AI chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {needsSetup && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="chat-warning-banner flex items-center gap-2 px-4 py-2 text-left text-xs w-full"
          >
            <span>⚙️</span>
            <span>
              AI is not configured yet.{" "}
              <span className="underline">Click here to set up your AI provider →</span>
            </span>
          </button>
        )}

        {/* Messages Area */}
        <div className="chat-messages flex-1 overflow-y-auto p-3 space-y-3">
          {isLoadingChat ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-[#c8b89a] opacity-60" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 opacity-60">
              {needsSetup ? (
                <>
                  <Settings className="h-8 w-8 text-[#c8b89a]" />
                  <p className="typewriter-text text-center text-sm text-[#c8b89a]">
                    Set up your AI provider to start chatting.
                  </p>
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="btn-skeuomorphic px-4 py-2 text-xs mt-2"
                  >
                    ⚙️ Configure AI Provider
                  </button>
                </>
              ) : (
                <>
                  <Sparkles className="h-8 w-8 text-[#c8b89a]" />
                  <p className="typewriter-text text-center text-sm text-[#c8b89a]">
                    Ask me anything about your note, or let me help you write.
                  </p>
                  <div className="flex flex-col gap-1.5 w-full mt-2">
                    {["Summarize this note", "Improve my writing", "What are the key points?"].map(
                      (suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                          className="chat-suggestion text-left text-xs px-3 py-2"
                        >
                          {suggestion}
                        </button>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" && (
                  <div className="chat-ai-icon mt-1 shrink-0">
                    <Bot className="h-3 w-3" />
                  </div>
                )}
                <div
                  className={cn(
                    "chat-bubble max-w-[85%] px-3 py-2 text-sm",
                    msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
                  )}
                >
                  {msg.content || (
                    <span className="flex items-center gap-1 opacity-60">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="typewriter-text text-xs">Thinking...</span>
                    </span>
                  )}
                </div>
              </div>
            ))
          )}

          {error && (
            <div className="chat-error rounded px-3 py-2 text-xs">⚠️ {error}</div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-area px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                needsSetup
                  ? "Set up AI provider first..."
                  : hasActiveStream
                    ? "Waiting for response..."
                    : "Ask about your note... (Enter to send)"
              }
              rows={1}
              disabled={hasActiveStream || needsSetup || !noteId}
              className="chat-textarea flex-1 resize-none overflow-hidden"
              style={{ scrollbarWidth: "none" }}
            />
            {hasActiveStream ? (
              <button
                onClick={handleStop}
                className="btn-skeuomorphic shrink-0 p-2"
                aria-label="Stop generating"
                title="Stop"
              >
                <X className="h-4 w-4 text-red-400" />
              </button>
            ) : (
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || needsSetup || !noteId}
                className="btn-skeuomorphic shrink-0 p-2 disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-[#c8b89a] opacity-40 text-center" suppressHydrationWarning>
            {hydrated && provider ? `${provider.label} · ${aiSettings.model} · Shift+Enter for new line` : "Shift+Enter for new line"}
          </p>
        </div>
      </div>
    </>
  );
}
