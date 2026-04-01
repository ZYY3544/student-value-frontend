/**
 * AccountSettings - 账户设置页面
 * 支持编辑：全名、邮箱、头像首字母
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, Loader2, User, Mail, CircleUser } from 'lucide-react';
import { authHeaders } from '../services/authService';

interface AccountSettingsProps {
  userId?: string;
  onBack: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'https://student-value-backend.onrender.com';

export const AccountSettings: React.FC<AccountSettingsProps> = ({ userId, onBack }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarInitial, setAvatarInitial] = useState('U');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 加载现有资料
  useEffect(() => {
    fetch(`${API_BASE}/api/user/profile`, { headers: authHeaders() })
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setFullName(json.data.full_name || '');
          setEmail(json.data.email || '');
          setAvatarInitial(json.data.avatar_initial || (json.data.full_name?.[0] || 'U'));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ full_name: fullName, email, avatar_initial: avatarInitial }),
      });
      const json = await res.json();
      if (json.success) setSaved(true);
    } catch (e) {
      console.error('[AccountSettings] save error:', e);
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [fullName, email, avatarInitial]);

  // 全名变化时自动更新头像首字母
  useEffect(() => {
    if (fullName.trim()) {
      setAvatarInitial(fullName.trim()[0].toUpperCase());
    }
  }, [fullName]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f8fafc]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#f8fafc] overflow-y-auto">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-8 h-16 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <h1 className="text-lg font-bold text-gray-800">账户设置</h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-800">个人资料</h2>
          </div>

          <div className="px-8 py-6 space-y-8">
            {/* 头像 */}
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center border-2 border-orange-200">
                <span className="text-2xl font-bold text-orange-600">{avatarInitial}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">头像</p>
                <p className="text-xs text-gray-400 mt-0.5">根据姓名首字母自动生成</p>
              </div>
            </div>

            {/* 全名 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 text-gray-400" />
                全名
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="请输入你的姓名"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0A66C2] focus:ring-2 focus:ring-[#0A66C2]/10 transition-all"
              />
            </div>

            {/* 邮箱 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 text-gray-400" />
                电子邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="请输入你的邮箱"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0A66C2] focus:ring-2 focus:ring-[#0A66C2]/10 transition-all"
              />
            </div>

            {/* 邀请码（只读） */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <CircleUser className="w-4 h-4 text-gray-400" />
                邀请码
              </label>
              <input
                type="text"
                value={userId || ''}
                disabled
                className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-green-600 font-medium">已保存</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#0A66C2] text-white text-sm font-medium rounded-xl hover:bg-[#004F90] disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
