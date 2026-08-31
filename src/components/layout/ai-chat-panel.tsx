"use client";

import * as React from "react";
import { Bot, Send, X, Sparkles, RotateCcw, Settings } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { useModalFocus } from "~/hooks/use-modal-focus";
import { ActionErrorMessage } from "~/components/ui/action-error-message";
import { AsyncStatusMessage } from "~/components/ui/async-status-message";

const CHAT_HISTORY_LOADING_MESSAGES = [
  "Opening this note's conversation...",
  "Your conversation is taking a little longer to arrive. The note is still ready beside you.",
  "If it stays here, close and reopen the AI panel or refresh the page.",
] as const;

const AI_RESPONSE_LOADING_MESSAGES = [
  "Reading your note and gathering a thoughtful response...",
  "This answer needs a little more time. You can pause it whenever you like.",
  "You can stop this response, then check the provider in AI settings before trying again.",
] as const;

interface Message {
  role: "user" | "assistant";
  content: string;
}

class ChatResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ChatResponseError";
  }
}

function getChatErrorMessage(error: unknown, providerLabel: string): string {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();
  const status = error instanceof ChatResponseError ? error.status : null;

  if (status === 404 || normalized.includes("note not found")) {
    return "This note is no longer available to the chat. Return to the note list and choose another note.";
  }
  if (status === 429 || normalized.includes("rate limit")) {
    return `${providerLabel} is receiving too many requests right now. Give it a quiet moment, then try again.`;
  }
  if (
    normalized.includes("api key") ||
    normalized.includes("invalid_api_key") ||
    normalized.includes("authentication_error")
  ) {
    return `${providerLabel} needs a valid API key. Open AI settings, check the key, then try again.`;
  }
  if (status === 401 && normalized.trim() === "unauthorized") {
    return "Your sign-in has expired. Refresh the page and sign in again before sending another message.";
  }
  if (status === 401 || status === 403) {
    return `${providerLabel} rejected its credentials. Open AI settings, check the API key, then try again.`;
  }
  if (normalized.includes("ollama")) {
    return "Ollama did not respond. Make sure it is running and that its address in AI settings is reachable.";
  }
  if (
    status === 500 ||
    normalized.includes("internal server") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("timeout")
  ) {
    return `${providerLabel} did not respond in time. Check the provider status or connection, then try again.`;
  }

  return `${providerLabel} could not finish this response. Check its settings and availability, then try again.`;
}

interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  noteTitle: string;
  noteId: string | null;
}

/**
 * Tracks active background streams per note.
 * Streams continue even when user switches notes.
 * Key = noteId, Value = { abort, onToken callbacks }
 */
interface ActiveStream {
  abort: AbortController;
  content: string;
  discardOutput: boolean;
}

const activeStreams = new Map<string, ActiveStream>();

export function AiChatPanel({
  isOpen,
  onClose,
  noteTitle,
  noteId,
}: AiChatPanelProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);
  const clearDialogRef = useModalFocus(showClearConfirm);
  // Initialize with env defaults (SSR-safe), then hydrate from localStorage
  const [aiSettings, setAiSettings] = React.useState<AiSettings>(() =>
    loadAiSettings(),
  );
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate settings from localStorage after mount to avoid SSR mismatch
  React.useEffect(() => {
    setAiSettings(loadAiSettings());
    setHydrated(true);
  }, []);

  React.useEffect(
    () => () => {
      for (const stream of activeStreams.values()) {
        stream.discardOutput = true;
        stream.abort.abort();
      }
      activeStreams.clear();
    },
    [],
  );

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const provider = aiSettings.providerId ? getProvider(aiSettings.providerId) : null;
  const utils = api.useUtils();

  // Load chat history from DB when noteId changes
  const {
    data: savedMessages,
    isLoading: isLoadingChat,
    isError: hasChatLoadError,
    refetch: refetchChat,
  } = api.chat.getByNoteId.useQuery(
    { noteId: noteId! },
    { enabled: !!noteId, refetchInterval: isStreaming ? 2000 : false }
  );

  React.useEffect(() => {
    setError(null);
  }, [noteId]);

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
  }, [savedMessages, noteId]);

  // Ref to always have current noteId (avoids stale closures in async functions)
  const currentNoteIdRef = React.useRef(noteId);
  currentNoteIdRef.current = noteId;

  // tRPC mutations
  const addMessageMutation = api.chat.addMessage.useMutation();
  const clearChatMutation = api.chat.clearByNoteId.useMutation({
    onSuccess: (_data, variables) => {
      void utils.chat.getByNoteId.invalidate({ noteId: variables.noteId });
    },
    onError: (_error, variables) => {
      if (currentNoteIdRef.current === variables.noteId) {
        setError("The conversation could not be cleared. Your previous messages are being restored; please try again.");
      }
      void utils.chat.getByNoteId.invalidate({ noteId: variables.noteId });
    },
  });

  // Scroll to bottom
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  React.useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
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
      setError("Open AI settings to finish setting up your provider.");
      return;
    }

    if (provider?.requiresApiKey && !aiSettings.apiKey) {
      setError(`${provider.label} requires an API key. Open AI settings to add it.`);
      return;
    }

    setError(null);
    setInput("");

    // Optimistically show user message + empty assistant bubble
    setMessages((prev) => [...prev, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    // Capture everything needed before async work (noteId could change).
    const targetNoteId = noteId;
    const chatHistory = [...messages];
    const currentSettings = { ...aiSettings };
    const streamState: ActiveStream = {
      abort: new AbortController(),
      content: "",
      discardOutput: false,
    };
    activeStreams.set(targetNoteId, streamState);

    try {
      // Persist first so assistant messages can never overtake their user prompt.
      await addMessageMutation.mutateAsync({
        noteId: targetNoteId,
        role: "user",
        content: trimmed,
      });
    } catch {
      activeStreams.delete(targetNoteId);
      setIsStreaming(false);
      setError("Could not save your message. Please try again.");
      setInput(trimmed);
      setMessages((previous) => previous.slice(0, -2));
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    // A clear action may have happened while the message was being saved.
    if (streamState.discardOutput) {
      try {
        await clearChatMutation.mutateAsync({ noteId: targetNoteId });
      } catch {
        // The regular mutation error handler will refresh auth state if needed.
      }
      activeStreams.delete(targetNoteId);
      if (currentNoteIdRef.current === targetNoteId) setIsStreaming(false);
      return;
    }

    void startBackgroundStream(
      targetNoteId,
      trimmed,
      chatHistory,
      currentSettings,
      streamState,
    );
  };

  const startBackgroundStream = async (
    targetNoteId: string,
    userPrompt: string,
    chatHistory: Message[],
    settings: AiSettings,
    streamState: ActiveStream,
  ) => {
    if (currentNoteIdRef.current === targetNoteId) setIsStreaming(true);

    let fullResponse = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: streamState.abort.signal,
        body: JSON.stringify({
          noteId: targetNoteId,
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
        let errorMessage = "The AI provider returned an error";
        try {
          const errData = (await response.json()) as { error?: string };
          errorMessage = errData.error ?? errorMessage;
        } catch {
          // Some providers return plain text or an empty body on failure.
        }
        throw new ChatResponseError(errorMessage, response.status);
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
          let parsed: { content?: string; error?: string } | null = null;
          try {
            parsed = JSON.parse(data) as { content?: string; error?: string };
          } catch {
            continue;
          }
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.content) {
            fullResponse += parsed.content;
            const stream = activeStreams.get(targetNoteId);
            if (stream) stream.content = fullResponse;
          }
        }
      }

      if (!fullResponse && !streamState.discardOutput) {
        throw new Error("The provider returned an empty response");
      }

      // Save complete response to DB
      if (fullResponse && !streamState.discardOutput) {
        addMessageMutation.mutate(
          { noteId: targetNoteId, role: "assistant", content: fullResponse },
          {
            onError: () => {
              if (currentNoteIdRef.current === targetNoteId) {
                setError("The answer is visible, but it could not be saved. Copy anything important, then try again.");
              }
            },
          },
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (fullResponse && !streamState.discardOutput) {
          addMessageMutation.mutate(
            { noteId: targetNoteId, role: "assistant", content: fullResponse },
            {
              onError: () => {
                if (currentNoteIdRef.current === targetNoteId) {
                  setError("The partial answer is visible, but it could not be saved. Copy anything important before leaving.");
                }
              },
            },
          );
        }
      } else {
        if (currentNoteIdRef.current === targetNoteId) {
          const configuredProvider = settings.providerId
            ? getProvider(settings.providerId)
            : null;
          const providerLabel = configuredProvider?.label ?? "The AI provider";
          setError(getChatErrorMessage(err, providerLabel));
          setMessages((prev) =>
            prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev
          );
        }
      }
    } finally {
      if (activeStreams.get(targetNoteId) === streamState) {
        activeStreams.delete(targetNoteId);
      }
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
    setShowClearConfirm(true);
  };

  const confirmClear = () => {
    setShowClearConfirm(false);
    setMessages([]);
    setError(null);
    if (noteId) {
      // Also abort any active stream for this note
      const stream = activeStreams.get(noteId);
      if (stream) {
        stream.discardOutput = true;
        stream.abort.abort();
      }
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

      {/* Clear Chat Confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowClearConfirm(false)}
          />
          <div
            ref={clearDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-chat-title"
            className="relative w-full max-w-xs rounded-lg border border-[#5a4a3a] bg-[#2a2218] p-5 shadow-xl"
          >
            <h3 id="clear-chat-title" className="text-sm font-bold text-[#d4c5a9] mb-2">Clear chat history?</h3>
            <p className="text-xs text-[#c8b89a] opacity-70 mb-4">
              This will permanently delete all messages in this conversation. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                autoFocus
                className="btn-skeuomorphic px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={confirmClear}
                className="btn-skeuomorphic px-3 py-1.5 text-xs text-red-400 border-red-900/50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={cn(
          "chat-panel fixed bottom-0 right-0 z-50 flex flex-col transition-all duration-150 ease-out",
          "h-[min(540px,100dvh)] w-full md:w-[380px]",
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
            <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              AI is not configured yet.{" "}
              <span className="underline">Open settings to choose your provider</span>
            </span>
          </button>
        )}

        {/* Messages Area */}
        <div
          className="chat-messages flex-1 space-y-3 overflow-y-auto p-3"
          aria-busy={isLoadingChat || hasActiveStream}
        >
          {isLoadingChat ? (
            <div className="flex h-full items-center justify-center px-3">
              <AsyncStatusMessage
                active
                appearanceDelayMs={0}
                messages={CHAT_HISTORY_LOADING_MESSAGES}
                className="w-full max-w-xs"
              />
            </div>
          ) : hasChatLoadError ? (
            <div className="flex h-full items-center justify-center px-3">
              <ActionErrorMessage
                title="The conversation could not be opened"
                message="The server did not return this note's chat history. Check your connection, then try again."
                className="w-full max-w-xs text-xs"
                action={(
                  <button
                    type="button"
                    onClick={() => void refetchChat()}
                    className="btn-skeuomorphic px-3 py-1.5 text-xs"
                  >
                    Try again
                  </button>
                )}
              />
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
                    className="btn-skeuomorphic mt-2 flex items-center gap-2 px-4 py-2 text-xs"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" /> Configure AI Provider
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
                  {msg.content ? (
                    msg.role === "assistant" ? (
                      <div className="chat-markdown prose-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )
                  ) : (
                    <AsyncStatusMessage
                      active
                      appearanceDelayMs={0}
                      messages={AI_RESPONSE_LOADING_MESSAGES}
                      className="border-0 bg-transparent p-0 text-[#c8b89a]"
                    />
                  )}
                </div>
              </div>
            ))
          )}

          {error && (
            <ActionErrorMessage
              title="AI needs your attention"
              message={error}
              className="text-xs"
            />
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
