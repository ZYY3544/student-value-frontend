
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Loader2, Sparkles, X, ChevronDown, AlertCircle, Lock, GraduationCap, Briefcase, CloudUpload, Zap } from 'lucide-react';
import { InputCard } from './components/InputCard';
import { ResultView } from './components/ResultView';
import { WelcomeView } from './components/WelcomeView';
import { generateAssessment } from './services/geminiService';
import { AssessmentInput, AssessmentResult, AppState } from './types';

const CITIES = ["北京", "上海", "深圳", "广州", "杭州", "南京", "成都", "武汉", "苏州", "西安", "其他"];
const INDUSTRIES = ["互联网", "高科技", "金融", "大健康", "汽车", "消费品", "新零售", "地产", "泛娱乐", "教育", "农业", "通用行业"];
const EDUCATION_LEVELS = ["大专", "本科", "硕士", "博士"];
const COMPANY_TYPES = ["国有企业", "外资企业", "民营企业", "合资企业", "事业单位", "其他"];
const FUNCTIONS = [
  "算法", "软件开发", "产品管理", "数据分析与商业智能",
  "硬件开发", "信息安全", "投融资管理", "战略管理",
  "法务", "人力资源", "资产管理", "市场营销",
  "销售", "硬件测试", "税务", "内审",
  "软件测试", "产品运营", "公共关系", "游戏设计",
  "项目管理", "电商运营", "风险管理", "财务管理",
  "会计", "网络教育", "供应链管理", "广告",
  "采购", "客户服务", "物流", "行政管理",
  "IT服务", "销售运营", "媒体推广运营", "通用职能"
];

const DEFAULT_FORM_DATA: AssessmentInput = {
  assessmentType: 'CV',
  city: '',
  industry: '',
  jobTitle: '',
  jobFunction: '',
  resumeText: '',
  resumeFile: null,
  resumeFileName: '',
  educationLevel: '',
  major: '',
  companyType: '',
  targetCompany: '',
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.WELCOME);
  const [retryCount, setRetryCount] = useState(0);
  const [showInsufficientDialog, setShowInsufficientDialog] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>(localStorage.getItem('invite_code') || '');

  // 页面停留时间追踪
  const pageEnteredAt = useRef<number>(Date.now());
  const currentPageName = useRef<string>('welcome');
  const pageDurations = useRef<Record<string, number>>({});
  const assessLogId = useRef<number | null>(null);

  const computeCurrentPage = useCallback((): string => {
    if (appState === AppState.WELCOME) return 'welcome';
    if (appState === AppState.LOADING) return 'form';
    if (appState === AppState.RESULT) return 'result';
    return 'form';
  }, [appState]);

  const sendUpdateDuration = useCallback((col: string, durationS: number, useBeacon = false) => {
    const payload = JSON.stringify({
      logId: assessLogId.current,
      column: col,
      durationS,
    });
    const url = 'https://student-value-backend.onrender.com/api/mini/update-duration';
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {});
    }
  }, []);

  const POST_ASSESS_COLS: Record<string, string> = {
    result: 'result_unlocked_s',
  };

  const flushPageDuration = useCallback((prevPage: string, durationS: number, useBeacon = false) => {
    if (durationS < 1) return;
    const rounded = Math.round(durationS);
    pageDurations.current[prevPage] = (pageDurations.current[prevPage] || 0) + rounded;

    const col = POST_ASSESS_COLS[prevPage];
    if (col && assessLogId.current) {
      sendUpdateDuration(col, pageDurations.current[prevPage], useBeacon);
    }
  }, [sendUpdateDuration]);

  useEffect(() => {
    const newPage = computeCurrentPage();
    const prevPage = currentPageName.current;
    if (newPage === prevPage) return;

    const durationS = (Date.now() - pageEnteredAt.current) / 1000;
    flushPageDuration(prevPage, durationS);

    currentPageName.current = newPage;
    pageEnteredAt.current = Date.now();
  }, [appState, computeCurrentPage, flushPageDuration]);

  // 用户离开页面时（关闭/切后台）用 sendBeacon 保证发送成功
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const durationS = (Date.now() - pageEnteredAt.current) / 1000;
        flushPageDuration(currentPageName.current, durationS, true);
        pageEnteredAt.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [flushPageDuration]);

  const [formData, setFormData] = useState<AssessmentInput>(DEFAULT_FORM_DATA);
  const [errors, setErrors] = useState<string[]>([]);
  const [resumeInputMode, setResumeInputMode] = useState<'upload' | 'text'>('upload');
  const [result, setResult] = useState<AssessmentResult | null>(null);

  const handleInputChange = (field: keyof AssessmentInput, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors.includes(field)) {
      setErrors(prev => prev.filter(e => e !== field));
    }
  };

  const handleSubmit = async () => {
    const newErrors: string[] = [];
    if (!formData.city) newErrors.push('city');
    if (!formData.industry) newErrors.push('industry');
    if (!formData.jobTitle) newErrors.push('jobTitle');
    if (!formData.jobFunction) newErrors.push('jobFunction');
    if (!formData.educationLevel) newErrors.push('educationLevel');
    if (!formData.major.trim()) newErrors.push('major');
    if (!formData.companyType) newErrors.push('companyType');

    if (!formData.resumeFile && !formData.resumeText.trim()) {
      newErrors.push('resumeSource');
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    // 结算当前页面时长
    const now = Date.now();
    const curDur = Math.round((now - pageEnteredAt.current) / 1000);
    if (currentPageName.current && curDur >= 1) {
      pageDurations.current[currentPageName.current] =
        (pageDurations.current[currentPageName.current] || 0) + curDur;
      pageEnteredAt.current = now;
    }

    assessLogId.current = null;

    setAppState(AppState.LOADING);
    try {
      const data = await generateAssessment(formData, retryCount, {
        welcomeS: pageDurations.current['welcome'],
        formS: pageDurations.current['form'],
      });
      if (data.logId) assessLogId.current = data.logId;
      setResult(data);
      setAppState(AppState.RESULT);
    } catch (error: unknown) {
      console.error("Assessment Error:", error);
      const msg = error instanceof Error ? error.message : "未知错误";
      if (msg === 'insufficient_input') {
        setRetryCount(prev => prev + 1);
        setShowInsufficientDialog(true);
        setAppState(AppState.FORM);
      } else if (msg.includes('403') || msg.includes('邀请码')) {
        localStorage.removeItem('invite_code');
        setInviteCode('');
        alert('邀请码已失效，请重新输入');
        setAppState(AppState.WELCOME);
      } else {
        alert(`评估失败：${msg}`);
        setAppState(AppState.FORM);
      }
    }
  };

  const renderFormContent = () => {
    const hasError = (field: string) => errors.includes(field);

    const selectClass = (field: string) =>
      `w-full appearance-none bg-white border ${hasError(field) ? 'border-rose-500' : 'border-slate-200'} text-sm font-semibold rounded-2xl py-3.5 px-5 pr-10 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all`;

    const inputClass = (field: string) =>
      `w-full bg-white border ${hasError(field) ? 'border-rose-500' : 'border-slate-200'} text-sm font-semibold text-slate-900 rounded-2xl py-3.5 px-5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-300`;

    return (
      <div className="bg-[#f8fafc] min-h-screen">
        {/* 简洁标题 */}
        <div className="px-6 pt-10 pb-2">
          <span className="text-xs font-bold text-[#2D63ED] tracking-widest uppercase block mb-1">ASSESSMENT INFO</span>
          <h1 className="text-3xl font-black text-gray-900">个人专业信息</h1>
          <p className="text-slate-500 text-sm mt-1">填写下方详细信息，为您生成专属人才身价报告。</p>
        </div>

        <div className="px-5 pt-6 pb-32 space-y-5">
          {/* 院校信息 */}
          <InputCard title="院校信息" icon={<GraduationCap size={24} />} accentColor="text-[#2D63ED]">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-slate-700">学历背景</label>
                  {hasError('educationLevel') && <span className="text-[10px] text-rose-500 font-bold">请选择</span>}
                </div>
                <div className="relative">
                  <select
                    value={formData.educationLevel}
                    onChange={(e) => handleInputChange('educationLevel', e.target.value)}
                    style={{ color: formData.educationLevel ? undefined : '#cbd5e1' }}
                    className={selectClass('educationLevel')}
                  >
                    <option value="" disabled hidden>请选择学历</option>
                    {EDUCATION_LEVELS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-slate-700">所学专业</label>
                  {hasError('major') && <span className="text-[10px] text-rose-500 font-bold">必填项</span>}
                </div>
                <input
                  type="text"
                  placeholder="例如：计算机科学与技术"
                  value={formData.major}
                  onChange={(e) => handleInputChange('major', e.target.value)}
                  className={inputClass('major')}
                />
              </div>
            </div>
          </InputCard>

          {/* 职场意向 */}
          <InputCard title="职场意向" icon={<Briefcase size={24} />} accentColor="text-[#2D63ED]">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-slate-700">意向城市</label>
                  {hasError('city') && <span className="text-[10px] text-rose-500 font-bold">请选择</span>}
                </div>
                <div className="relative">
                  <select
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    style={{ color: formData.city ? undefined : '#cbd5e1' }}
                    className={selectClass('city')}
                  >
                    <option value="" disabled hidden>请选择城市</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-slate-700">意向行业</label>
                  {hasError('industry') && <span className="text-[10px] text-rose-500 font-bold">请选择</span>}
                </div>
                <div className="relative">
                  <select
                    value={formData.industry}
                    onChange={(e) => handleInputChange('industry', e.target.value)}
                    style={{ color: formData.industry ? undefined : '#cbd5e1' }}
                    className={selectClass('industry')}
                  >
                    <option value="" disabled hidden>请选择行业</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-slate-700">企业性质</label>
                  {hasError('companyType') && <span className="text-[10px] text-rose-500 font-bold">请选择</span>}
                </div>
                <div className="relative">
                  <select
                    value={formData.companyType}
                    onChange={(e) => handleInputChange('companyType', e.target.value)}
                    style={{ color: formData.companyType ? undefined : '#cbd5e1' }}
                    className={selectClass('companyType')}
                  >
                    <option value="" disabled hidden>请选择类型</option>
                    {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">意向企业</label>
                <input
                  type="text"
                  placeholder="例如：腾讯（选填）"
                  value={formData.targetCompany}
                  onChange={(e) => handleInputChange('targetCompany', e.target.value)}
                  className={inputClass('')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-slate-700">意向岗位</label>
                  {hasError('jobTitle') && <span className="text-[10px] text-rose-500 font-bold">必填项</span>}
                </div>
                <input
                  type="text"
                  placeholder="例如：产品经理"
                  value={formData.jobTitle}
                  onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                  className={inputClass('jobTitle')}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-slate-700">所属职能</label>
                  {hasError('jobFunction') && <span className="text-[10px] text-rose-500 font-bold">请选择</span>}
                </div>
                <div className="relative">
                  <select
                    value={formData.jobFunction}
                    onChange={(e) => handleInputChange('jobFunction', e.target.value)}
                    style={{ color: formData.jobFunction ? undefined : '#cbd5e1' }}
                    className={selectClass('jobFunction')}
                  >
                    <option value="" disabled hidden>请选择职能</option>
                    {FUNCTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </InputCard>

          {/* 简历信息 */}
          <InputCard title="简历信息" icon={<CloudUpload size={24} />} accentColor="text-[#2D63ED]">
            <p className="text-xs text-slate-400 mb-1">以下两种方式二选一，请勿重复填写。</p>
            <div className="flex flex-col gap-4">
              {/* Segmented Control */}
              <div className="relative flex bg-slate-100 rounded-xl p-1">
                <div
                  className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-[#2D63ED] rounded-[10px] transition-transform duration-300 ease-out"
                  style={{ transform: resumeInputMode === 'text' ? 'translateX(calc(100% + 4px))' : 'translateX(0)' }}
                />
                <button
                  onClick={() => setResumeInputMode('upload')}
                  className={`relative z-10 flex-1 py-2 text-sm font-semibold rounded-[10px] transition-colors duration-200 ${resumeInputMode === 'upload' ? 'text-white' : 'text-slate-400'}`}
                >
                  上传简历
                </button>
                <button
                  onClick={() => setResumeInputMode('text')}
                  className={`relative z-10 flex-1 py-2 text-sm font-semibold rounded-[10px] transition-colors duration-200 ${resumeInputMode === 'text' ? 'text-white' : 'text-slate-400'}`}
                >
                  手动填写
                </button>
              </div>

              {/* Content Area */}
              {resumeInputMode === 'text' ? (
                <textarea
                  value={formData.resumeText}
                  onChange={(e) => {
                    handleInputChange('resumeText', e.target.value);
                    if (errors.includes('resumeSource')) setErrors(prev => prev.filter(err => err !== 'resumeSource'));
                  }}
                  placeholder="请描述实习经历、项目经验、校园活动等，信息越完整，评估结果越准确～"
                  className={`w-full h-32 bg-white border ${hasError('resumeSource') ? 'border-rose-500' : 'border-slate-200'} text-sm font-medium text-slate-900 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all overflow-y-auto resume-input-scroll placeholder:text-slate-300 leading-relaxed`}
                />
              ) : (
                <div>
                  {formData.resumeFile ? (
                    <div className="bg-blue-50 border border-blue-100 rounded-3xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-[#2D63ED] rounded-2xl flex items-center justify-center text-white">
                          <FileText size={22} />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-bold text-slate-900 truncate max-w-[180px]">
                            {formData.resumeFileName}
                          </span>
                          <span className="text-xs text-[#2D63ED] font-medium">已上传附件</span>
                        </div>
                      </div>
                      <button
                        onClick={() => { handleInputChange('resumeFile', null); handleInputChange('resumeFileName', ''); }}
                        className="w-10 h-10 flex items-center justify-center bg-white rounded-full text-rose-500 active:scale-90 transition-transform"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <label className="group cursor-pointer">
                      <div className={`border-2 border-dashed ${hasError('resumeSource') ? 'border-rose-300' : 'border-slate-200'} rounded-3xl py-10 flex flex-col items-center justify-center text-center`}>
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                          <CloudUpload className="w-7 h-7 text-[#2D63ED]" />
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mb-1">点击上传简历文件</h4>
                        <p className="text-xs text-slate-400">支持 PDF、Word 格式，大小不超过 10MB</p>
                      </div>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const base64 = (reader.result as string).split(',')[1];
                              handleInputChange('resumeFile', { mimeType: file.type, data: base64 });
                              handleInputChange('resumeFileName', file.name);
                              if (errors.includes('resumeSource')) setErrors(prev => prev.filter(err => err !== 'resumeSource'));
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
            {hasError('resumeSource') && <p className="text-xs text-rose-500 font-semibold mt-2 flex items-center justify-center gap-1"><AlertCircle size={14} />请上传简历附件或输入履历内容</p>}
          </InputCard>

          {/* 提交按钮 */}
          <div className="pt-6">
            <button
              onClick={handleSubmit}
              className="w-full bg-[#FFC12D] text-slate-900 py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-amber-200/50 active:scale-[0.98] transition-all"
            >
              生成测评报告
              <Zap className="w-5 h-5 fill-slate-900" />
            </button>
          </div>

          {/* 隐私说明 */}
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs pt-2 pb-6">
            <Lock className="w-3.5 h-3.5" />
            <span>您的数据已加密处理，仅用于 AI 引擎分析生成报告，确保隐私安全。</span>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (appState) {
      case AppState.WELCOME:
        return <WelcomeView onStart={() => setAppState(AppState.FORM)} inviteCode={inviteCode} onInviteSuccess={(code) => { setInviteCode(code); localStorage.setItem('invite_code', code); }} />;
      case AppState.LOADING:
        return (
          <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="relative mb-8">
               <div className="absolute inset-0 gradient-primary opacity-20 blur-3xl animate-pulse rounded-full"></div>
               <Loader2 className="w-16 h-16 text-[#0A66C2] animate-spin relative z-10" />
            </div>
            <div className="h-7 overflow-hidden relative mb-2">
              <div className="animate-loading-scroll">
                <h2 className="h-7 flex items-center justify-center text-lg font-black text-[#110e0c] whitespace-nowrap">正在匹配校招薪酬数据...</h2>
                <h2 className="h-7 flex items-center justify-center text-lg font-black text-[#110e0c] whitespace-nowrap">正在分析院校竞争力...</h2>
                <h2 className="h-7 flex items-center justify-center text-lg font-black text-[#110e0c] whitespace-nowrap">正在解码能力画像...</h2>
                <h2 className="h-7 flex items-center justify-center text-lg font-black text-[#110e0c] whitespace-nowrap">报告已就绪，即将揭晓你的校招身价...</h2>
              </div>
            </div>
          </div>
        );
      case AppState.RESULT:
        if (result) return <ResultView result={result} inputData={formData} assessmentType={formData.assessmentType} onReset={() => { setFormData(DEFAULT_FORM_DATA); setResult(null); setErrors([]); setAppState(AppState.FORM); }} />;
        return renderFormContent();
      default:
        return renderFormContent();
    }
  };

  return (
    <div className="min-h-screen max-w-3xl mx-auto">
      {renderContent()}

      {/* 简历信息不足弹窗 */}
      {showInsufficientDialog && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center pb-20 p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInsufficientDialog(false)}></div>
          <div className="bg-white w-full max-w-sm rounded-[24px] overflow-hidden shadow-2xl relative z-10 animate-slide-up p-8 flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-5">
              <AlertCircle className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">简历信息不足</h3>
            <p className="text-xs text-slate-400 text-center leading-5 mb-6">检测到您提交的简历信息较少，可能影响评估准确性，建议补充后重新提交。</p>
            <button onClick={() => setShowInsufficientDialog(false)} className="w-full py-3.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold rounded-xl active:scale-95 transition-all">
              我知道了，去补充
            </button>
            <button onClick={() => { setShowInsufficientDialog(false); handleSubmit(); }} className="w-full py-2.5 mt-2 text-slate-400 text-sm font-medium active:scale-95 transition-all">
              暂不补充，继续生成
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
