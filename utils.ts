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
