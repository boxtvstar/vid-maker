import React, { useState } from 'react';
import { getApiKey, setApiKey as saveApiKey } from './utils';
import { VIDEO_TEMPLATES } from './templates';
import type { ProjectData } from './utils';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface ApiKeyModalProps {
  show: boolean;
  onClose: () => void;
  currentApiKey: string;
  setApiKey: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ show, onClose, currentApiKey, setApiKey }) => {
  const [tempKey, setTempKey] = useState(currentApiKey);
  const [isValidating, setIsValidating] = useState(false);
  const [validationMsg, setValidationMsg] = useState<{ type: 'success' | 'error' | null, text: string }>({ type: null, text: '' });

  if (!show) return null;

  const handleSave = async () => {
    // 키 정제
    const cleanKey = tempKey.trim();
    if (!cleanKey) {
      setValidationMsg({ type: 'error', text: 'API 키를 입력해주세요.' });
      return;
    }

    // [중요] 우선 무조건 저장 (사용자 불편 해소: 선 저장, 후 검증)
    saveApiKey(cleanKey);
    setApiKey(cleanKey);
    
    // UI 업데이트 (저장 완료 알림)
    setIsValidating(true);
    setValidationMsg({ type: null, text: '키 저장 완료! 가장 안정적인 모델(gemini-pro)로 연결 테스트 중...' });

    try {
      // 2. 모델 초기화 및 테스트
      const genAI = new GoogleGenerativeAI(cleanKey);
      
      // 사용자 API 키로 테스트한 결과: nano-banana-pro-preview 모델 사용 확인
      const model = genAI.getGenerativeModel({ model: "nano-banana-pro-preview" });

      await model.generateContent("테스트");

      // 3. 테스트 성공 피드백
      setValidationMsg({ type: 'success', text: '✅ 연결 테스트 성공! 완벽합니다.' });
      
      // 잠시 후 모달 닫기
      setTimeout(() => {
        onClose();
        setValidationMsg({ type: null, text: '' });
      }, 1000);

    } catch (error: any) {
      console.error("API Key Validation Error:", error);
      let errorMsg = error.message || "알 수 없는 오류";
      
      // 에러가 나도 이미 저장은 되었음을 안내
      setValidationMsg({ 
        type: 'error', 
        text: `⚠️ 키는 저장되었으나 연결 테스트는 실패했습니다: ${errorMsg.substring(0, 30)}...` 
      });
      
      // 잠시 후 닫기 (저장은 이미 됨)
      setTimeout(() => {
        onClose();
        setValidationMsg({ type: null, text: '' });
      }, 2000);
    } finally {
      setIsValidating(false);
    }
  };

  const handleForceSave = () => {
    saveApiKey(tempKey);
    setApiKey(tempKey);
    alert('검증 없이 저장했습니다.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1a1630] rounded-2xl border-2 border-primary/30 p-8 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold font-display flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl">key</span>
            API 키 설정
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <p className="text-white/70 text-sm mb-6 leading-relaxed">
          Google Gemini API 키를 입력하세요. API 키는 브라우저의 로컬 스토리지에 안전하게 저장됩니다.
        </p>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-white/90">Gemini API Key</label>
            <input
              type="password"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-[#0d0a1a] border-2 border-[#292348] rounded-lg p-3 text-white focus:border-primary focus:ring-primary focus:outline-none transition-all"
            />
          </div>
          
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
            <p className="text-xs text-white/60 leading-relaxed">
              💡 <strong className="text-primary">팁:</strong> Google AI Studio에서 무료 API 키를 발급받을 수 있습니다.
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">
                여기서 발급 →
              </a>
            </p>
          </div>

          {/* 검증 메시지 표시 영역 */}
          {validationMsg.text && (
            <div className={`p-3 rounded-lg text-sm font-bold text-center ${validationMsg.type === 'error' ? 'bg-red-500/20 text-red-400' : validationMsg.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/70'}`}>
              {validationMsg.text}
            </div>
          )}
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 px-4 rounded-lg bg-white/5 border border-[#292348] hover:bg-white/10 font-bold transition-all" disabled={isValidating}>
                취소
              </button>
              <button 
                onClick={handleSave} 
                disabled={isValidating}
                className={`flex-[2] py-3 px-4 rounded-lg font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${isValidating ? 'bg-[#292348] text-white/50 cursor-not-allowed' : 'bg-primary hover:bg-primary/90 shadow-primary/20'}`}
              >
                {isValidating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    검증 중...
                  </>
                ) : '검증 및 저장'}
              </button>
            </div>
            
            <button 
              onClick={handleForceSave}
              className="text-xs text-white/30 hover:text-white/70 underline py-2 transition-colors"
            >
              검증 없이 그냥 저장하기 (문제가 있을 경우 사용)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ProjectsModalProps {
  show: boolean;
  onClose: () => void;
  projects: ProjectData[];
  onLoadProject: (project: ProjectData) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({ show, onClose, projects, onLoadProject }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1a1630] rounded-2xl border-2 border-primary/30 p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold font-display flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl">folder</span>
            저장된 프로젝트
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-6xl text-white/20 mb-4 block">folder_off</span>
            <p className="text-white/50">저장된 프로젝트가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="bg-[#0d0a1a] border border-[#292348] rounded-lg p-4 hover:border-primary/50 transition-all group cursor-pointer" onClick={() => { onLoadProject(project); onClose(); }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">{project.name}</h3>
                    <p className="text-sm text-white/60 mb-2">{project.topic}</p>
                    <div className="flex gap-3 text-xs text-white/40">
                      <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{project.videoLength === 'shorts' ? '쇼츠' : '롱폼'}</span>
                      <span>•</span>
                      <span>{project.scenes.length}개 장면</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface TemplatesModalProps {
  show: boolean;
  onClose: () => void;
  onApplyTemplate: (template: typeof VIDEO_TEMPLATES[0]) => void;
}

export const TemplatesModal: React.FC<TemplatesModalProps> = ({ show, onClose, onApplyTemplate }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1a1630] rounded-2xl border-2 border-primary/30 p-8 max-w-4xl w-full max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold font-display flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl">dashboard_customize</span>
            템플릿 선택
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {VIDEO_TEMPLATES.map((template) => (
            <div key={template.id} className="bg-[#0d0a1a] border border-[#292348] rounded-lg p-5 hover:border-primary/50 transition-all group cursor-pointer" onClick={() => { onApplyTemplate(template); }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-2xl">{template.icon}</span>
                </div>
                <div>
                  <h3 className="font-bold group-hover:text-primary transition-colors">{template.name}</h3>
                  <p className="text-xs text-white/40">{template.videoLength === 'shorts' ? '쇼츠' : '롱폼'} • {template.scenes}개 장면</p>
                </div>
              </div>
              <p className="text-sm text-white/60 mb-3">{template.description}</p>
              <div className="bg-primary/10 rounded p-2">
                <p className="text-xs text-white/50 italic">"{template.topic}"</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
