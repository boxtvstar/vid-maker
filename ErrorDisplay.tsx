import React from 'react';

interface ErrorDisplayProps {
  error: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry, onDismiss }) => {
  if (!error) return null;

  const isSuccess = error.startsWith('✅');
  const icon = isSuccess ? 'check_circle' : 'error';
  const colorClass = isSuccess 
    ? 'bg-green-500/10 border-green-500/30 text-green-400' 
    : 'bg-red-500/10 border-red-500/30 text-red-400';

  return (
    <div className={`p-4 border rounded-lg ${colorClass} animate-in fade-in slide-in-from-top-5 duration-300`}>
      <div className="flex items-start gap-3">
        <span className={`material-symbols-outlined text-xl flex-shrink-0 ${
          isSuccess ? 'text-green-400' : 'text-red-400'
        }`}>
          {icon}
        </span>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm whitespace-pre-line break-words">{error}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onRetry && !isSuccess && (
            <button
              onClick={onRetry}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-xs font-bold transition-all"
            >
              재시도
            </button>
          )}
          
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 hover:bg-white/10 rounded-lg transition-all"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
