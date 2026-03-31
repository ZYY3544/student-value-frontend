
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Diamond, FileText, Loader2, Sparkles, X, ChevronDown, AlertCircle, Lock, GraduationCap, Briefcase, CloudUpload, Zap, BarChart3, TrendingUp, LogOut, Clock } from 'lucide-react';
import { ResultView } from './components/ResultView';
import { AuthPage } from './components/AuthPage';
import { WechatLoginPage } from './components/WechatLoginPage';
import { WechatCallback } from './components/WechatCallback';
import { PaymentPage } from './components/PaymentPage';
import { HistoryPage } from './components/HistoryPage';
import { generateAssessment } from './services/geminiService';
import { AssessmentInput, AssessmentResult, AppState } from './types';
import { Toast } from './components/Toast';
import {
  getToken, getStoredUser, clearAuth, fetchMe,
  getInviteCode, setInviteCode, clearInviteCode, verifyInviteCode,
  type WjUser, type SubscriptionStatus
} from './services/authService';

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

// 邀请码认证：code 既是身份标识也是 userId
function getStoredAuthCode(): string | null {
  return getInviteCode();
}

const App: React.FC = () => {
  // auth 现在只存邀请码，code 即 userId
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [appState, setAppState] = useState<AppState>(AppState.AUTH);

  // 启动时检查 localStorage 中的邀请码，静默验证有效性
  useEffect(() => {
    const code = getStoredAuthCode();
    if (!code) {
      setAuthLoading(false);
      return;
    }
    // 静默验证邀请码是否还有效
    verifyInviteCode(code).then(result => {
      if (result.success) {
        setAuthCode(code);
      } else {
        // 邀请码已失效，清除
        clearInviteCode();
      }
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (authCode) {
      if (appState === AppState.AUTH) setAppState(AppState.FORM);
    } else {
      setAppState(AppState.AUTH);
    }
  }, [authCode, authLoading]);

  const handleAuthSuccess = () => {
    const code = getStoredAuthCode();
    setAuthCode(code);
    setAppState(AppState.FORM);
  };

  const handleLogout = () => {
    clearInviteCode();
    setAuthCode(null);
    setAppState(AppState.AUTH);
  };

  // 页面停留时间追踪
  const pageEnteredAt = useRef<number>(Date.now());
  const currentPageName = useRef<string>('welcome');
  const pageDurations = useRef<Record<string, number>>({});
  const assessLogId = useRef<number | null>(null);

  const computeCurrentPage = useCallback((): string => {
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
    const url = `${import.meta.env.VITE_API_URL || 'https://student-value-backend.onrender.com'}/api/mini/update-duration`;
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
      const data = await generateAssessment(formData, {
        welcomeS: pageDurations.current['welcome'],
        formS: pageDurations.current['form'],
      }, authCode);
      if (data.logId) assessLogId.current = data.logId;
      setResult(data);
      setAppState(AppState.RESULT);
    } catch (error: unknown) {
      console.error("Assessment Error:", error);
      const msg = error instanceof Error ? error.message : "未知错误";
      setToast({ message: `评估失败：${msg}`, type: 'error' });
      setAppState(AppState.FORM);
    }
  };

  const renderFormContent = () => {
    const hasError = (field: string) => errors.includes(field);

    // 计算步骤进度
    const step1Done = !!(formData.educationLevel && formData.major.trim());
    const step2Done = !!(formData.city && formData.industry && formData.jobTitle.trim() && formData.jobFunction);
    const step3Done = !!(formData.resumeFile || formData.resumeText.trim());
    const currentStep = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : 0;

    const selectClass = (field: string) =>
      `w-full appearance-none bg-white border ${hasError(field) ? 'border-rose-400' : 'border-slate-200'} text-sm rounded-2xl py-4 px-5 pr-10 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all`;

    const inputClass = (field: string) =>
      `w-full bg-white border ${hasError(field) ? 'border-rose-400' : 'border-slate-200'} text-sm text-slate-900 rounded-2xl py-4 px-5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-300`;

    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-white font-sans text-slate-900">
        {/* Left Sidebar */}
        <aside className="w-full md:w-[400px] bg-[#0A66C2] p-6 md:p-12 flex flex-col relative overflow-hidden shrink-0">
          {/* Logo */}
          <div className="flex items-center gap-3 text-white mb-6 md:mb-16 z-10">
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
              <Sparkles className="w-6 h-6 text-[#f8ea1a]" />
            </div>
            <span className="text-xl font-bold tracking-tight">求职加速器（校园版）</span>
          </div>

          {/* Hero Card */}
          <div className="bg-white/10 rounded-3xl md:rounded-[40px] p-6 md:p-10 border border-white/20 backdrop-blur-md flex-1 flex flex-col z-10">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-3 md:mb-4 leading-tight hidden md:block">
              你的能力<br />比简历写的更好
            </h1>
            <p className="text-white/60 text-sm md:text-base mb-6 md:mb-10 leading-relaxed hidden md:block">
              上传简历，1 分钟拿到你的校招竞争力报告！<br />
              帮你找到简历里没写出来的优势，一直改到 HR 抢着约你面试！！
            </p>

            {/* Feature List */}
            <div className="space-y-8 hidden md:block">
              <div className="flex items-center gap-4 text-white/60">
                <div className="bg-white/10 p-2 rounded-lg">
                  <Zap className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">1 分钟出报告</span>
              </div>
              <div className="flex items-center gap-4 text-white/60">
                <div className="bg-white/10 p-2 rounded-lg">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">看清你的竞争力</span>
              </div>
              <div className="flex items-center gap-4 text-white/60">
                <div className="bg-white/10 p-2 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">AI 帮你改到位</span>
              </div>

              {/* Steps */}
              <div className="pt-8 space-y-0">
                {/* Step 1 */}
                <div className="relative flex gap-4 pb-12">
                  <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-white/20"></div>
                  <div className={`z-10 p-2.5 rounded-full ${currentStep === 1 ? 'bg-[#3B82F6] shadow-lg shadow-blue-900/20' : step1Done ? 'bg-green-500' : 'bg-white/10'}`}>
                    <GraduationCap className={`w-5 h-5 ${currentStep === 1 || step1Done ? 'text-white' : 'text-white/40'}`} />
                  </div>
                  <div>
                    <p className={`font-semibold ${currentStep === 1 || step1Done ? 'text-white' : 'text-white/40'}`}>院校信息</p>
                    <p className={`text-xs mt-1 ${currentStep === 1 ? 'text-white/50' : step1Done ? 'text-green-300/60' : 'text-white/30'}`}>
                      {step1Done ? '已完成' : currentStep === 1 ? '步骤 1 / 3 (进行中)' : '待填写'}
                    </p>
                  </div>
                </div>
                {/* Step 2 */}
                <div className="relative flex gap-4 pb-12">
                  <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-white/20"></div>
                  <div className={`z-10 p-2.5 rounded-full ${currentStep === 2 ? 'bg-[#3B82F6] shadow-lg shadow-blue-900/20' : step2Done ? 'bg-green-500' : 'bg-white/10'}`}>
                    <Briefcase className={`w-5 h-5 ${currentStep === 2 || step2Done ? 'text-white' : 'text-white/40'}`} />
                  </div>
                  <div>
                    <p className={`font-semibold ${currentStep === 2 || step2Done ? 'text-white' : 'text-white/40'}`}>职场意向</p>
                    <p className={`text-xs mt-1 ${currentStep === 2 ? 'text-white/50' : step2Done ? 'text-green-300/60' : 'text-white/30'}`}>
                      {step2Done ? '已完成' : currentStep === 2 ? '步骤 2 / 3 (进行中)' : '待填写'}
                    </p>
                  </div>
                </div>
                {/* Step 3 */}
                <div className="relative flex gap-4">
                  <div className={`z-10 p-2.5 rounded-full ${currentStep === 3 ? 'bg-[#3B82F6] shadow-lg shadow-blue-900/20' : step3Done ? 'bg-green-500' : 'bg-white/10'}`}>
                    <FileText className={`w-5 h-5 ${currentStep === 3 || step3Done ? 'text-white' : 'text-white/40'}`} />
                  </div>
                  <div>
                    <p className={`font-semibold ${currentStep === 3 || step3Done ? 'text-white' : 'text-white/40'}`}>简历上传</p>
                    <p className={`text-xs mt-1 ${currentStep === 3 ? 'text-white/50' : step3Done ? 'text-green-300/60' : 'text-white/30'}`}>
                      {step3Done ? '已完成' : currentStep === 3 ? '步骤 3 / 3 (进行中)' : '最后一步'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="mt-6 md:mt-12 text-white/40 text-sm z-10 hidden md:block">
            &copy; {new Date().getFullYear()} 铭曦管理咨询. 版权所有。
          </div>

          {/* Background Decoration - 浮动 Logo */}
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl hidden md:block"></div>
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl hidden md:block"></div>
          <Diamond className="absolute top-[15%] right-[12%] w-10 h-10 text-white/[0.07] animate-float hidden md:block" />
          <Diamond className="absolute top-[40%] left-[8%] w-7 h-7 text-white/[0.05] animate-float-soft hidden md:block" style={{ animationDelay: '1s' }} />
          <Diamond className="absolute bottom-[25%] right-[25%] w-14 h-14 text-white/[0.06] animate-float hidden md:block" style={{ animationDelay: '2s' }} />
          <Diamond className="absolute bottom-[10%] left-[20%] w-8 h-8 text-white/[0.04] animate-float-soft hidden md:block" style={{ animationDelay: '0.5s' }} />
          <Diamond className="absolute top-[65%] right-[8%] w-6 h-6 text-white/[0.05] animate-float hidden md:block" style={{ animationDelay: '1.5s' }} />
        </aside>

        {/* Main Content */}
        <main className="flex-1 bg-[#F8FAFC] p-4 md:p-12 overflow-y-auto">
          <div className="max-w-4xl mx-auto">

            {/* Title Section */}
            <section className="mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">个人信息</h2>
              <p className="text-slate-500">填写下方信息，生成你的专属竞争力报告，还能直享 AI 一站式解读报告、改写简历、模拟面试等服务！</p>
            </section>

            {/* Form Sections */}
            <div className="space-y-12">
              {/* Section 1: 院校信息 */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 text-[#0A66C2]">
                  <GraduationCap className="w-6 h-6" />
                  <h3 className="text-lg font-bold">院校信息</h3>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700">学历</label>
                      {hasError('educationLevel') && <span className="text-xs text-rose-500 font-semibold">请选择</span>}
                    </div>
                    <div className="relative">
                      <select
                        value={formData.educationLevel}
                        onChange={(e) => handleInputChange('educationLevel', e.target.value)}
                        style={{ color: formData.educationLevel ? undefined : '#94a3b8' }}
                        className={selectClass('educationLevel')}
                      >
                        <option value="" disabled hidden>请选择学历</option>
                        {EDUCATION_LEVELS.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                      <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700">专业</label>
                      {hasError('major') && <span className="text-xs text-rose-500 font-semibold">必填项</span>}
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
              </div>

              {/* Section 2: 职场意向 */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 text-[#0A66C2]">
                  <Briefcase className="w-6 h-6" />
                  <h3 className="text-lg font-bold">职场意向</h3>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700">意向城市</label>
                      {hasError('city') && <span className="text-xs text-rose-500 font-semibold">请选择</span>}
                    </div>
                    <div className="relative">
                      <select
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        style={{ color: formData.city ? undefined : '#94a3b8' }}
                        className={selectClass('city')}
                      >
                        <option value="" disabled hidden>请选择城市</option>
                        {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700">意向行业</label>
                      {hasError('industry') && <span className="text-xs text-rose-500 font-semibold">请选择</span>}
                    </div>
                    <div className="relative">
                      <select
                        value={formData.industry}
                        onChange={(e) => handleInputChange('industry', e.target.value)}
                        style={{ color: formData.industry ? undefined : '#94a3b8' }}
                        className={selectClass('industry')}
                      >
                        <option value="" disabled hidden>请选择行业</option>
                        {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                      </select>
                      <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700">意向岗位</label>
                      {hasError('jobTitle') && <span className="text-xs text-rose-500 font-semibold">必填项</span>}
                    </div>
                    <input
                      type="text"
                      placeholder="例如：产品经理"
                      value={formData.jobTitle}
                      onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                      className={inputClass('jobTitle')}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700">意向企业</label>
                    </div>
                    <input
                      type="text"
                      placeholder="例如：腾讯（选填）"
                      value={formData.targetCompany}
                      onChange={(e) => handleInputChange('targetCompany', e.target.value)}
                      className={inputClass('')}
                    />
                  </div>
                </div>

                {/* 职业方向：3个短下拉框，第1个=jobFunction，第2/3个=jobFunctions */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-slate-700">职业方向 <span className="text-slate-400 font-normal">（至少选一个，报告会对比不同赛道的竞争力）</span></label>
                    {hasError('jobFunction') && <span className="text-xs text-rose-500 font-semibold">请至少选一个</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[0, 1, 2].map((idx) => {
                      const allSelected = [formData.jobFunction, ...(formData.jobFunctions || [])];
                      const currentVal = idx === 0 ? formData.jobFunction : (formData.jobFunctions || [])[idx - 1] || '';
                      return (
                        <div key={idx} className="relative">
                          <select
                            value={currentVal}
                            onChange={(e) => {
                              if (idx === 0) {
                                handleInputChange('jobFunction', e.target.value);
                              } else {
                                const current = [...(formData.jobFunctions || [])];
                                if (e.target.value) {
                                  current[idx - 1] = e.target.value;
                                } else {
                                  current.splice(idx - 1, 1);
                                }
                                handleInputChange('jobFunctions', current.filter(Boolean));
                              }
                            }}
                            style={{ color: currentVal ? undefined : '#cbd5e1' }}
                            className={`${selectClass(idx === 0 ? 'jobFunction' : '_none')} ${idx > 0 && !currentVal ? 'border-dashed' : ''}`}
                          >
                            <option value="" disabled={idx === 0} hidden={idx === 0}>{idx === 0 ? '目标方向' : `可选方向 ${idx}`}</option>
                            {FUNCTIONS.filter(f => f === currentVal || !allSelected.includes(f)).map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Section 3: 简历信息 */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 text-[#0A66C2]">
                  <CloudUpload className="w-6 h-6" />
                  <h3 className="text-lg font-bold">简历信息</h3>
                </div>

                {/* Segmented Control */}
                <div className="relative flex bg-slate-100 rounded-xl p-1 max-w-xs">
                  <div
                    className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-[#0A66C2] rounded-[10px] transition-transform duration-300 ease-out"
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

                {resumeInputMode === 'text' ? (
                  <textarea
                    value={formData.resumeText}
                    onChange={(e) => {
                      handleInputChange('resumeText', e.target.value);
                      if (errors.includes('resumeSource')) setErrors(prev => prev.filter(err => err !== 'resumeSource'));
                    }}
                    placeholder="请描述实习经历、项目经验、校园活动等，信息越完整，评估结果越准确～"
                    className={`w-full h-40 bg-white border ${hasError('resumeSource') ? 'border-rose-400' : 'border-slate-200'} text-sm text-slate-900 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all overflow-y-auto resume-input-scroll placeholder:text-slate-300 leading-relaxed`}
                  />
                ) : (
                  <div>
                    {formData.resumeFile ? (
                      <div className="bg-blue-50 border border-blue-100 rounded-[32px] p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-[#0A66C2] rounded-2xl flex items-center justify-center text-white">
                            <FileText size={24} />
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-bold text-slate-900 truncate max-w-[300px]">
                              {formData.resumeFileName}
                            </span>
                            <span className="text-xs text-[#0A66C2] font-medium mt-0.5">已上传附件</span>
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
                      <label
                        className="group cursor-pointer block"
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.querySelector('div')?.classList.add('border-[#0A66C2]', 'bg-blue-50/50'); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.querySelector('div')?.classList.remove('border-[#0A66C2]', 'bg-blue-50/50'); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.querySelector('div')?.classList.remove('border-[#0A66C2]', 'bg-blue-50/50');
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
                            if (!validTypes.includes(file.type)) return;
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
                      >
                        <div className={`border-2 border-dashed ${hasError('resumeSource') ? 'border-rose-300' : 'border-slate-200'} rounded-2xl h-40 flex flex-col items-center justify-center text-center transition-colors`}>
                          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
                            <CloudUpload className="w-6 h-6 text-[#0A66C2]" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 mb-1">点击或拖拽简历文件至此</h4>
                          <p className="text-xs text-slate-400">支持 PDF, Word 格式，大小不超过 10MB</p>
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
                {hasError('resumeSource') && <p className="text-sm text-rose-500 font-semibold flex items-center gap-1"><AlertCircle size={16} />请上传简历附件或输入履历内容</p>}
              </div>
            </div>

            {/* Action Button */}
            <div className="mt-16 space-y-6">
              <button
                onClick={handleSubmit}
                className="w-full bg-[#FFC12D] text-slate-900 py-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 shadow-lg shadow-amber-200 active:scale-[0.98] transition-all"
              >
                生成评估报告
                <Zap className="w-6 h-6 fill-slate-900" />
              </button>
              <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                <Lock className="w-4 h-4" />
                <span>您的数据已加密保护，仅用于本次分析与报告生成。我们承诺不将您的个人信息用于任何 AI 模型训练，全方位保障隐私安全。</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  };

  const renderContent = () => {
    if (authLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
          <Loader2 className="w-10 h-10 text-[#0A66C2] animate-spin" />
        </div>
      );
    }

    switch (appState) {
      case AppState.AUTH:
        return (
          <AuthPage
            onAuthSuccess={handleAuthSuccess}
          />
        );
      case AppState.HISTORY:
        return authCode ? (
          <HistoryPage
            userId={authCode}
            onBack={() => setAppState(AppState.FORM)}
            onSelectRecord={(histResult, histInput, resumeText) => {
              setResult(histResult);
              setFormData({ ...histInput, resumeText: resumeText || histInput.resumeText });
              setAppState(AppState.RESULT);
            }}
          />
        ) : null;
      case AppState.LOADING:
        return (
          <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="relative mb-8">
               <div className="absolute inset-0 gradient-primary opacity-20 blur-3xl animate-pulse rounded-full"></div>
               <Loader2 className="w-16 h-16 text-[#0A66C2] animate-spin relative z-10" />
            </div>
            <div className="h-7 overflow-hidden relative mb-2">
              <div className="animate-loading-scroll">
                <h2 className="h-7 flex items-center justify-center text-lg font-black text-[#110e0c] whitespace-nowrap">正在解析你的简历结构...</h2>
                <h2 className="h-7 flex items-center justify-center text-lg font-black text-[#110e0c] whitespace-nowrap">正在分析你的核心能力画像...</h2>
                <h2 className="h-7 flex items-center justify-center text-lg font-black text-[#110e0c] whitespace-nowrap">正在诊断你的简历健康度...</h2>
                <h2 className="h-7 flex items-center justify-center text-lg font-black text-[#110e0c] whitespace-nowrap">正在匹配校招市场薪酬数据...</h2>
                <h2 className="h-7 flex items-center justify-center text-lg font-black text-[#110e0c] whitespace-nowrap">报告生成完毕，正在加载...</h2>
              </div>
            </div>
          </div>
        );
      case AppState.RESULT:
        if (result) return <ResultView result={result} inputData={formData} assessmentType={formData.assessmentType} onReset={() => { setFormData(DEFAULT_FORM_DATA); setResult(null); setErrors([]); setAppState(AppState.FORM); }} userId={authCode} />;
        return renderFormContent();
      default:
        return renderFormContent();
    }
  };

  return (
    <div className="min-h-screen">
      {renderContent()}
      <Toast
        message={toast?.message || ''}
        visible={!!toast}
        type={toast?.type || 'success'}
        duration={toast?.type === 'error' ? 6000 : 4000}
        onClose={() => setToast(null)}
      />
    </div>
  );
};

export default App;
