"use client";

import * as React from "react";
import { X, ExternalLink, Eye, EyeOff, Check, RotateCcw, Settings } from "lucide-react";
import { cn } from "~/lib/utils";
import { useModalFocus } from "~/hooks/use-modal-focus";
import {
  PROVIDERS,
  getProvider,
  isUsingEnvDefaults,
  type AiSettings,
  type ProviderId,
} from "~/lib/ai-providers";
import { ActionErrorMessage } from "~/components/ui/action-error-message";

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AiSettings;
  onSave: (settings: AiSettings) => void;
  onReset: () => void;
}

// Detect which fields are coming from env vars
function getEnvSource(): Partial<Record<keyof AiSettings, boolean>> {
  return {
    providerId: !!process.env.NEXT_PUBLIC_AI_PROVIDER,
    model: !!process.env.NEXT_PUBLIC_AI_MODEL,
    ollamaHost: !!process.env.NEXT_PUBLIC_OLLAMA_HOST,
  };
}

function EnvBadge() {
  return (
    <span className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-900/40 text-amber-400 border border-amber-700/40">
      .env
    </span>
  );
}

export function AiSettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
  onReset,
}: AiSettingsModalProps) {
  const [draft, setDraft] = React.useState<AiSettings>(settings);
  const [showKey, setShowKey] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const dialogRef = useModalFocus(isOpen);
  const usingEnvDefaults = isUsingEnvDefaults();
  const envSource = getEnvSource();

  React.useEffect(() => {
    if (!isOpen) return;
    setDraft(settings);
    setSaveError(null);
  }, [isOpen, settings]);

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const provider = draft.providerId ? getProvider(draft.providerId) : null;

  const handleProviderChange = (id: ProviderId) => {
    const p = getProvider(id);
    setDraft((prev) => ({
      ...prev,
      providerId: id,
      model: p.defaultModel,
      customBaseUrl: p.defaultBaseUrl ?? prev.customBaseUrl,
    }));
  };

  const handleSave = () => {
    setSaveError(null);
    try {
      onSave(draft);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 800);
    } catch {
      setSaveError("This browser did not allow Leath Notes to store your AI settings. Check site storage permissions, then try again.");
    }
  };

  const handleReset = () => {
    setSaveError(null);
    try {
      onReset();
      onClose();
    } catch {
      setSaveError("This browser did not allow Leath Notes to reset the saved settings. Check site storage permissions, then try again.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        className="settings-modal relative my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col"
      >
        {/* Header */}
        <div className="settings-modal-header flex items-center justify-between px-5 py-4">
          <div>
            <h2 id="ai-settings-title" className="embossed-text flex items-center gap-2 text-base font-bold uppercase tracking-wider">
              <Settings className="h-4 w-4" aria-hidden="true" /> AI Settings
            </h2>
            <p className="mt-0.5 text-[11px] text-[#c8b89a] opacity-60">
              {usingEnvDefaults
                ? "Using defaults from server .env — override below"
                : "Custom settings saved in your browser"}
            </p>
          </div>
          <button onClick={onClose} className="btn-skeuomorphic p-1.5" aria-label="Close settings">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="settings-modal-body flex-1 space-y-5 overflow-y-auto px-5 py-4">

          {saveError && (
            <ActionErrorMessage
              title="AI settings were not saved"
              message={saveError}
              className="text-xs"
            />
          )}

          {/* Provider selector */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <span className="settings-label">Provider</span>
              {envSource.providerId && usingEnvDefaults && <EnvBadge />}
            </div>
            <div className="grid grid-cols-1 gap-1.5" role="group" aria-label="AI provider">
              {PROVIDERS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={cn(
                    "settings-provider-btn text-left",
                    draft.providerId === p.id && "active"
                  )}
                >
                  <span className="font-medium">{p.label}</span>
                  {!p.requiresApiKey && (
                    <span className="ml-2 text-[10px] opacity-50">(no key needed)</span>
                  )}
                  {draft.providerId === p.id && (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[#d4c5a9]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          {provider && (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <label htmlFor="ai-model" className="settings-label">Model</label>
              {envSource.model && usingEnvDefaults && <EnvBadge />}
            </div>
            <select
              id="ai-model"
              value={draft.model}
              onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
              className="settings-select w-full"
            >
              {provider.models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="Custom model name"
              value={draft.model}
              onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
              placeholder={`Or type custom: ${provider.modelPlaceholder}`}
              className="settings-input w-full"
            />
          </div>
          )}

          {/* Ollama host */}
          {draft.providerId === "ollama" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label htmlFor="ai-ollama-host" className="settings-label">Ollama Host URL</label>
                {envSource.ollamaHost && usingEnvDefaults && <EnvBadge />}
              </div>
              <input
                id="ai-ollama-host"
                type="url"
                value={draft.ollamaHost}
                onChange={(e) => setDraft((prev) => ({ ...prev, ollamaHost: e.target.value }))}
                placeholder="http://localhost:11434"
                className="settings-input w-full"
              />
              <p className="text-[11px] text-[#c8b89a] opacity-50">
                Run Ollama locally: <code className="font-mono">ollama serve</code>
              </p>
            </div>
          )}

          {/* Custom Base URL (for Sumopod or other OpenAI-compatible endpoints) */}
          {provider?.requiresBaseUrl && (
            <div className="space-y-2">
              <label htmlFor="ai-base-url" className="settings-label">API Base URL</label>
              <input
                id="ai-base-url"
                type="url"
                value={draft.customBaseUrl}
                onChange={(e) => setDraft((prev) => ({ ...prev, customBaseUrl: e.target.value }))}
                placeholder={provider.defaultBaseUrl ?? "https://your-endpoint.com/v1"}
                className="settings-input w-full"
              />
              <p className="text-[11px] text-[#c8b89a] opacity-50">
                OpenAI-compatible endpoint URL (must support <code className="font-mono">/chat/completions</code>)
              </p>
            </div>
          )}

          {/* API Key */}
          {provider?.requiresApiKey && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <label htmlFor="ai-api-key" className="settings-label">{provider.apiKeyLabel}</label>
                </div>
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-1 text-[11px] text-[#c8b89a] opacity-70 transition-opacity hover:opacity-100"
                >
                  Get key <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="relative">
                <input
                  id="ai-api-key"
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={provider.apiKeyPlaceholder}
                  className="settings-input w-full pr-12"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-[#c8b89a] opacity-60 transition-opacity hover:opacity-100"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-[#c8b89a] opacity-50">
                Stored in this browser and sent only with AI requests; it is not saved in the database.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="settings-modal-footer flex items-center justify-between px-5 py-4">
          {/* Reset to env defaults — only show if user has overridden */}
          {!usingEnvDefaults ? (
            <button
              onClick={handleReset}
              className="flex min-h-11 items-center gap-1.5 text-[11px] text-[#c8b89a] opacity-60 transition-opacity hover:opacity-90"
              title="Clear saved settings and revert to .env defaults"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to .env defaults
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-skeuomorphic px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={cn("btn-skeuomorphic-primary px-4 py-2 text-sm", saved && "opacity-80")}
            >
              {saved ? (
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Saved
                </span>
              ) : (
                "Save Settings"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
