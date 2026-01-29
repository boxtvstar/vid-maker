import React from 'react';

interface RecoveryModalProps {
  timestamp: string;
  onRecover: () => void;
  onDismiss: () => void;
}

export const RecoveryModal: React.FC<RecoveryModalProps> = ({ timestamp, onRecover, onDismiss }) => {
  const timeAgo = () => {
    const now = new Date();
    const saved = new Date(timestamp);
    const diffMinutes = Math.floor((now.getTime() - saved.getTime()) / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes}분 전`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}시간 전`;
    } else {
      return saved.toLocaleDateString('ko-KR');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[#0d0a1a] border border-primary/30 rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-primary/20 animate-in fade-in zoom-in duration-300">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-amber-500/20 rounded-xl">
            <span className="material-symbols-outlined text-amber-400 text-3xl">restore</span>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-white mb-1">저장된 작업 발견</h3>
            <p className="text-sm text-white/60">
              {timeAgo()}에 저장된 작업이 있습니다
            </p>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-4 mb-6">
          <p className="text-sm text-white/70 leading-relaxed">
            이전에 작업하던 프로젝트를 복구하시겠습니까? 
            복구하지 않으면 자동 저장된 내용이 삭제됩니다.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-medium transition-all"
          >
            새로 시작
          </button>
          <button
            onClick={onRecover}
            className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 rounded-lg text-white font-bold transition-all shadow-lg shadow-primary/20"
          >
            복구하기
          </button>
        </div>
      </div>
    </div>
  );
};
