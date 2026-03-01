import React from 'react';

export type PaymentMethod = {
  id: string;
  name: string;
  icon: React.ReactNode;
  info?: string;
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'balance', name: '零钱', icon: <div className="w-6 h-6 bg-[#07C160] rounded flex items-center justify-center text-white text-[10px] font-bold">¥</div> },
  { id: 'cmb', name: '招商银行储蓄卡', info: '(8888)', icon: <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center text-white text-[10px] font-bold">招</div> },
  { id: 'ccb', name: '建设银行储蓄卡', info: '(6666)', icon: <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-[10px] font-bold">建</div> },
];

export const PLAN_CONFIG = {
  basic: { name: '基础单次评估', price: '0.99' },
  standard: { name: '进阶分析报告', price: '6.99' },
} as const;
