
import React from 'react';

interface InputCardProps {
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  accentColor?: string;
  customBg?: string;
}

export const InputCard: React.FC<InputCardProps> = ({ title, children, icon, accentColor }) => {
  return (
    <div className="bg-white rounded-3xl p-6 border border-gray-100">
      {(title || icon) && (
        <div className="flex items-center gap-3 mb-5">
          {icon && <div className={`${accentColor || 'text-[#2D63ED]'}`}>{icon}</div>}
          {title && <h3 className="text-gray-900 text-lg font-bold">{title}</h3>}
        </div>
      )}
      <div className="space-y-5">
        {children}
      </div>
    </div>
  );
};
