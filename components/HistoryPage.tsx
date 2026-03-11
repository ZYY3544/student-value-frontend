import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AssessmentResult, AssessmentInput } from '../types';
import { Clock, Briefcase, TrendingUp, ChevronRight, Loader2, BarChart3, Sparkles, ArrowLeft } from 'lucide-react';

interface HistoryRecord {
  id: string;
  form_data: {
    city: string;
    industry: string;
    jobTitle: string;
    jobFunction: string;
    educationLevel: string;
    major: string;
    companyType: string;
    targetCompany: string;
  };
  result: any;
  resume_text: string;
  created_at: string;
}

interface HistoryPageProps {
  userId: string;
  onSelectRecord: (result: AssessmentResult, inputData: AssessmentInput, resumeText: string) => void;
  onBack: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ userId, onSelectRecord, onBack }) => {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select('id, form_data, result, resume_text, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRecords(data as HistoryRecord[]);
      }
      setLoading(false);
    };
    fetchHistory();
  }, [userId]);

  const handleSelect = (record: HistoryRecord) => {
    const fd = record.form_data;
    const inputData: AssessmentInput = {
      assessmentType: 'CV',
      city: fd.city || '',
      industry: fd.industry || '',
      jobTitle: fd.jobTitle || '',
      jobFunction: fd.jobFunction || '',
      resumeText: record.resume_text || '',
      educationLevel: fd.educationLevel || '',
      major: fd.major || '',
      companyType: fd.companyType || '',
      targetCompany: fd.targetCompany || '',
    };

    const r = record.result;
    const result: AssessmentResult = {
      jobValue: r.salaryRange || '',
      personValue: r.salaryRange || '',
      currency: '人民币',
      level: r.level || 0,
      levelTag: r.levelTag || '',
      levelDesc: r.levelDesc || '',
      abilities: r.abilities,
      radarData: r.radarData,
      abilitySummary: r.abilitySummary,
      salaryCompetitiveness: r.salaryCompetitiveness,
      resumeHealthScore: r.resumeHealthScore,
      factors: r.factors,
      resumeText: r.resumeText || record.resume_text,
    };

    onSelectRecord(result, inputData, record.resume_text);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#0A66C2] rounded-lg flex items-center justify-center">
                <BarChart3 className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-800">历史评估记录</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-[#0A66C2] animate-spin mb-4" />
            <p className="text-slate-400 text-sm">加载中...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
              <Sparkles className="w-8 h-8 text-[#0A66C2]" />
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">暂无评估记录</h3>
            <p className="text-slate-400 text-sm mb-6">完成一次评估后，记录会显示在这里</p>
            <button
              onClick={onBack}
              className="px-6 py-3 bg-[#0A66C2] text-white rounded-xl font-semibold text-sm hover:bg-[#084d94] transition-colors"
            >
              开始评估
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((record) => {
              const fd = record.form_data;
              const r = record.result;
              return (
                <button
                  key={record.id}
                  onClick={() => handleSelect(record)}
                  className="w-full bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all text-left group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="px-3 py-1 bg-blue-50 text-[#0A66C2] text-xs font-bold rounded-full">
                          {r?.levelTag || '评估完成'}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(record.created_at)}
                        </div>
                      </div>

                      <h3 className="text-lg font-bold text-slate-800 mb-2 truncate">
                        {fd.jobTitle || '未知岗位'}
                      </h3>

                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3.5 h-3.5" />
                          {fd.industry} · {fd.city}
                        </span>
                        {r?.salaryRange && (
                          <span className="flex items-center gap-1 text-[#0A66C2] font-semibold">
                            <TrendingUp className="w-3.5 h-3.5" />
                            {r.salaryRange}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#0A66C2] transition-colors ml-4 flex-shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
