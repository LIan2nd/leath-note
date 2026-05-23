"use client";

import * as React from "react";
import { X, ExternalLink, Eye, EyeOff, Check, RotateCcw } from "lucide-react";
import { cn } from "~/lib/utils";
import {
  PROVIDERS,
  getProvider,
  isUsingEnvDefaults,
  type AiSettings,
  type ProviderId,
} from "~/lib/ai-providers";

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
    apiKey: !!process.env.NEXT_PUBLIC_AI_API_KEY,
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
  const usingEnvDefaults = isUsingEnvDefaults();
  const envSource = getEnvSource();

  React.useEffect(() => {
    setDraft(settings);
  }, [settings]);

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

  const provider = getProvider(draft.providerId);

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
    onSave(draft);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="settings-modal relative w-full max-w-md">
        {/* Header */}
        <div className="settings-modal-header flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="embossed-text text-base font-bold uppercase tracking-wider">
              ⚙️ AI Settings
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
        <div className="settings-modal-body space-y-5 px-5 py-4">

          {/* Provider selector */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <label className="settings-label">Provider</label>
              {envSource.providerId && usingEnvDefaults && <EnvBadge />}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {PROVIDERS.map((p) => (
                <button
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
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <label className="settings-label">Model</label>
              {envSource.model && usingEnvDefaults && <EnvBadge />}
            </div>
            <select
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
              value={draft.model}
              onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
              placeholder={`Or type custom: ${provider.modelPlaceholder}`}
              className="settings-input w-full"
            />
          </div>

          {/* Ollama host */}
          {draft.providerId === "ollama" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="settings-label">Ollama Host URL</label>
                {envSource.ollamaHost && usingEnvDefaults && <EnvBadge />}
              </div>
              <input
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
          {provider.requiresBaseUrl && (
            <div className="space-y-2">
              <label className="settings-label">API Base URL</label>
              <input
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
          {provider.requiresApiKey && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <label className="settings-label">{provider.apiKeyLabel}</label>
                  {envSource.apiKey && usingEnvDefaults && <EnvBadge />}
                </div>
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-[#c8b89a] opacity-60 hover:opacity-100 transition-opacity"
                >
                  Get key <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={
                    envSource.apiKey && usingEnvDefaults
                      ? "••••••••  (set via .env)"
                      : provider.apiKeyPlaceholder
                  }
                  className="settings-input w-full pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#c8b89a] opacity-50 hover:opacity-100 transition-opacity"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-[#c8b89a] opacity-50">
                Stored in your browser&apos;s localStorage — never sent to our servers.
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
              className="flex items-center gap-1.5 text-[11px] text-[#c8b89a] opacity-50 hover:opacity-80 transition-opacity"
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
