
import React from 'react';

interface InputCardProps {
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  accentColor?: string;
  customBg?: string;
}

export const InputCard: React.FC<InputCardProps> = ({ title, children, icon, accentColor, customBg }) => {
  return (
    <div className={`${customBg || 'bg-[#fbfbfb]/75'} backdrop-blur-md rounded-[28px] p-6 border border-white shadow-[0_8px_30px_rgba(183,204,171,0.1)] mb-6 relative overflow-hidden`}>
      {(title || icon) && (
        <div className="flex items-center gap-3 mb-6 relative z-10">
          {icon && <div className={`${accentColor || 'text-[#065758]'} opacity-80`}>{icon}</div>}
          {title && <h3 className="text-[#110e0c] text-[18px] tracking-tight" style={{ fontWeight: 700 }}>{title}</h3>}
        </div>
      )}
      <div className="space-y-5 relative z-10">
        {children}
      </div>
    </div>
  );
};
