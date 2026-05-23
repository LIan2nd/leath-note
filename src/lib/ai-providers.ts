// AI Provider configuration — all types and constants for multi-provider support

export type ProviderId = "ollama" | "openai" | "gemini" | "anthropic" | "openrouter" | "sumopod";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  requiresApiKey: boolean;
  requiresBaseUrl?: boolean; // for custom endpoint providers like Sumopod
  defaultBaseUrl?: string;
  defaultModel: string;
  modelPlaceholder: string;
  apiKeyPlaceholder: string;
  apiKeyLabel: string;
  docsUrl: string;
  models: { value: string; label: string }[];
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "ollama",
    label: "Ollama (Local)",
    requiresApiKey: false,
    defaultModel: "llama3.2",
    modelPlaceholder: "llama3.2",
    apiKeyPlaceholder: "",
    apiKeyLabel: "",
    docsUrl: "https://ollama.com",
    models: [
      { value: "llama3.2", label: "Llama 3.2" },
      { value: "llama3.1", label: "Llama 3.1" },
      { value: "llama3", label: "Llama 3" },
      { value: "mistral", label: "Mistral 7B" },
      { value: "gemma2", label: "Gemma 2" },
      { value: "phi3", label: "Phi-3" },
      { value: "qwen2.5", label: "Qwen 2.5" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    requiresApiKey: true,
    defaultModel: "gpt-4o-mini",
    modelPlaceholder: "gpt-4o-mini",
    apiKeyPlaceholder: "sk-...",
    apiKeyLabel: "OpenAI API Key",
    docsUrl: "https://platform.openai.com/api-keys",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini (fast)" },
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    requiresApiKey: true,
    defaultModel: "gemini-1.5-flash",
    modelPlaceholder: "gemini-1.5-flash",
    apiKeyPlaceholder: "AIza...",
    apiKeyLabel: "Google AI API Key",
    docsUrl: "https://aistudio.google.com/app/apikey",
    models: [
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (fast)" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    requiresApiKey: true,
    defaultModel: "claude-3-haiku-20240307",
    modelPlaceholder: "claude-3-haiku-20240307",
    apiKeyPlaceholder: "sk-ant-...",
    apiKeyLabel: "Anthropic API Key",
    docsUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (fast)" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    requiresApiKey: true,
    defaultModel: "meta-llama/llama-3.2-3b-instruct:free",
    modelPlaceholder: "meta-llama/llama-3.2-3b-instruct:free",
    apiKeyPlaceholder: "sk-or-...",
    apiKeyLabel: "OpenRouter API Key",
    docsUrl: "https://openrouter.ai/keys",
    models: [
      { value: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B (Free)" },
      { value: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B (Free)" },
      { value: "google/gemma-2-9b-it:free", label: "Gemma 2 9B (Free)" },
      { value: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B (Free)" },
      { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku" },
      { value: "google/gemini-flash-1.5", label: "Gemini 1.5 Flash" },
    ],
  },
  {
    id: "sumopod",
    label: "Sumopod",
    requiresApiKey: true,
    requiresBaseUrl: true,
    defaultBaseUrl: "https://your-app.sumopod.com/v1",
    defaultModel: "llama3",
    modelPlaceholder: "llama3",
    apiKeyPlaceholder: "your-sumopod-api-key",
    apiKeyLabel: "Sumopod API Key",
    docsUrl: "https://sumopod.com",
    models: [
      { value: "llama3", label: "Llama 3" },
      { value: "llama3.2", label: "Llama 3.2" },
      { value: "mistral", label: "Mistral" },
      { value: "qwen2.5", label: "Qwen 2.5" },
      { value: "gemma2", label: "Gemma 2" },
    ],
  },
];

export const DEFAULT_PROVIDER_ID: ProviderId | null = null;

export function getProvider(id: ProviderId): ProviderConfig {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
}

// Shape stored in localStorage
export interface AiSettings {
  providerId: ProviderId | null;
  model: string;
  apiKey: string;
  ollamaHost: string;
  customBaseUrl: string; // for Sumopod or any OpenAI-compatible endpoint
}

/**
 * Read AI defaults from NEXT_PUBLIC_ env vars (set in .env).
 * These are the server-operator defaults — user's localStorage overrides them.
 */
function getEnvDefaults(): AiSettings {
  const providerId =
    (process.env.NEXT_PUBLIC_AI_PROVIDER as ProviderId | undefined) ?? null;
  const provider = providerId ? getProvider(providerId) : null;
  return {
    providerId,
    model: process.env.NEXT_PUBLIC_AI_MODEL ?? provider?.defaultModel ?? "",
    apiKey: process.env.NEXT_PUBLIC_AI_API_KEY ?? "",
    ollamaHost: process.env.NEXT_PUBLIC_OLLAMA_HOST ?? "http://localhost:11434",
    customBaseUrl: process.env.NEXT_PUBLIC_AI_BASE_URL ?? provider?.defaultBaseUrl ?? "",
  };
}

const STORAGE_KEY = "leath-notes:ai-settings";

/**
 * Priority order:
 * 1. localStorage (user's own saved settings)
 * 2. NEXT_PUBLIC_ env vars (operator defaults from .env)
 * 3. Hardcoded fallback (Ollama local)
 */
export function loadAiSettings(): AiSettings {
  const envDefaults = getEnvDefaults();

  if (typeof window === "undefined") return envDefaults;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return envDefaults;
    // Merge: localStorage wins over env defaults
    return { ...envDefaults, ...(JSON.parse(raw) as Partial<AiSettings>) };
  } catch {
    return envDefaults;
  }
}

export function saveAiSettings(settings: AiSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/**
 * Returns true if the user has never manually saved settings
 * (i.e. currently running on env defaults).
 */
export function isUsingEnvDefaults(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === null;
}

/**
 * Returns true if AI is properly configured and ready to use.
 * - A provider must be selected
 * - If the provider requires an API key, it must be set
 */
export function isAiConfigured(settings: AiSettings): boolean {
  if (!settings.providerId) return false;
  const provider = getProvider(settings.providerId);
  if (provider.requiresApiKey && !settings.apiKey) return false;
  return true;
}
