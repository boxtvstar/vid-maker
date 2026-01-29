// Local Storage utilities for project management

export interface ProjectData {
  id: string;
  name: string;
  topic: string;
  videoLength: 'shorts' | 'long';
  videoTone: 'info' | 'story' | 'emotional' | 'fast';
  scriptBlocks: any[];
  scenes: any[];
  selectedVoice: any;
  selectedMotion: string;
  selectedBgm: string;
  createdAt: string;
  updatedAt: string;
}

export const saveProject = (projectData: ProjectData) => {
  try {
    const projects = getProjects();
    const existingIndex = projects.findIndex(p => p.id === projectData.id);
    
    if (existingIndex >= 0) {
      projects[existingIndex] = { ...projectData, updatedAt: new Date().toISOString() };
    } else {
      projects.push({ ...projectData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    
    localStorage.setItem('vidai_projects', JSON.stringify(projects));
    return true;
  } catch (error) {
    console.error('Failed to save project:', error);
    return false;
  }
};

export const getProjects = (): ProjectData[] => {
  try {
    const data = localStorage.getItem('vidai_projects');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load projects:', error);
    return [];
  }
};

export const deleteProject = (projectId: string) => {
  try {
    const projects = getProjects().filter(p => p.id !== projectId);
    localStorage.setItem('vidai_projects', JSON.stringify(projects));
    return true;
  } catch (error) {
    console.error('Failed to delete project:', error);
    return false;
  }
};

export const getApiKey = (): string | null => {
  return localStorage.getItem('vidai_api_key');
};

export const setApiKey = (apiKey: string) => {
  localStorage.setItem('vidai_api_key', apiKey);
};

export const exportAsVideo = async (scenes: any[], audioSettings: any) => {
  // 실제 구현에서는 FFmpeg.js나 서버 사이드 렌더링을 사용
  // 현재는 시뮬레이션
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        url: 'blob:video-export-demo',
        duration: '02:30',
        size: '42.8 MB'
      });
    }, 3000);
  });
};

export const generateSubtitles = (script: string, timestamps: number[]) => {
  // SRT 형식의 자막 생성
  const lines = script.split('. ');
  let srt = '';
  
  lines.forEach((line, index) => {
    if (line.trim()) {
      const start = timestamps[index] || index * 3;
      const end = start + 3;
      srt += `${index + 1}\n`;
      srt += `${formatTime(start)} --> ${formatTime(end)}\n`;
      srt += `${line.trim()}\n\n`;
    }
  });
  
  return srt;
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = '000';
  return `${h}:${m}:${s},${ms}`;
};

export const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Auto-save utilities
const AUTOSAVE_KEY = 'vidai_autosave';
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

export interface AutoSaveData {
  step: number;
  topic: string;
  videoLength: 'shorts' | 'long';
  videoTone: 'info' | 'story' | 'emotional' | 'fast';
  scenes: any[];
  scriptBlocks: any[];
  selectedVoice: any;
  timestamp: string;
}

export const autoSave = (data: AutoSaveData) => {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    }));
    return true;
  } catch (error) {
    console.error('Auto-save failed:', error);
    return false;
  }
};

export const loadAutoSave = (): AutoSaveData | null => {
  try {
    const data = localStorage.getItem(AUTOSAVE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // Check if autosave is less than 24 hours old
      const timestamp = new Date(parsed.timestamp);
      const now = new Date();
      const hoursDiff = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
      
      if (hoursDiff < 24) {
        return parsed;
      } else {
        // Clear old autosave
        clearAutoSave();
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to load auto-save:', error);
    return null;
  }
};

export const clearAutoSave = () => {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear auto-save:', error);
    return false;
  }
};

// Image compression utility
export const compressImage = async (imageUrl: string, maxWidth: number = 1920, quality: number = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
};

// API Queue system
class APIQueue {
  private queue: (() => Promise<any>)[] = [];
  private running = 0;
  private maxConcurrent = 2;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const fn = this.queue.shift();
    
    if (fn) {
      try {
        await fn();
      } finally {
        this.running--;
        this.process();
      }
    }
  }
}

export const apiQueue = new APIQueue();
