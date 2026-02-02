/**
 * Settings Service
 * 관리자 설정 (프롬프트, 모델 등) 관리
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export interface AppSettings {
  script: {
    systemPrompt: string;
    rules: string;
    model: string;
    // New fields
    defaultModel?: string;
    models?: {
      id: string;
      label: string;
      description: string;
      enabled: boolean;
    }[];
    temperature: number;
    maxTokens: number;
  };
  audio: {
    voices: {
      id: string;
      name: string;
      type: string;
      description: string;
      avatarUrl: string;
      gender: 'male' | 'female';
      previewUrl: string;
    }[];
    defaultVoice: string;
    // New fields
    defaultModel?: string;
    models?: {
      id: string;
      label: string;
      description: string;
      enabled: boolean;
    }[];
  };
  image: {
    models?: {
      id: string;
      label: string;
      description: string;
      enabled: boolean;
    }[];
    defaultModel?: string;
    styles: {
      id: string;
      label: string;
      prefix: string;
      previewUrl: string;
    }[];
    defaultStyle: string;
    promptGenerationSystem?: string;
  };
  video: {
    providers: {
      id: string;
      name: string;
      label: string;
      description: string;
      enabled: boolean;
    }[];
    defaultProvider: string;
    motionRules?: Record<string, string>;
    promptTemplate?: string;
  };
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE_URL}/api/settings`);
  if (!res.ok) {
    throw new Error(`Failed to fetch settings: ${res.status}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch settings');
  }
  return data.settings;
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update settings: ${res.status}`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to update settings');
  }
}
