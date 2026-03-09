# 职场价值评估系统 - 改造进度记录

> 项目前端：`/Users/zy/Desktop/value-assessment-system`
> 项目后端：`/Users/zy/Desktop/mini-app-backend`

---

## 项目概述

将原本直接调用 Google Gemini API 的前端应用，改造为对接专业 HAY 评估体系后端服务的完整产品。

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS + Recharts |
| 后端 | Python Flask + DeepSeek API + HAY 评估引擎 |
| 核心能力 | HAY 8因素模型 → 8能力维度映射 → 薪酬计算 |

---

## 2025-01-22 (Day 1)

### 一、前后端对接

**文件：`services/geminiService.ts`**

- [x] 移除 Google Gemini API 直接调用
- [x] 改为调用后端 API `http://localhost:5001/api/mini/assess`
- [x] 添加 `USE_MOCK` 开关（开发/生产切换）
- [x] 实现降级机制：API 调用失败时自动回退模拟数据
- [x] 实现数据转换层：将后端返回格式映射为前端期望格式

```typescript
// 后端返回 → 前端格式
{
  salaryRange → jobValue / personValue
  level → level
  levelTag → levelTag
  levelDesc → levelDesc
  abilities → abilities
  radarData → radarData
}
```

### 二、类型系统扩展

**文件：`types.ts`**

- [x] `AssessmentResult` 新增字段：
  - `level: number` - 职级 (10-25)
  - `levelTag: string` - 档位标签（搬砖圣手、业务脊梁等）
  - `levelDesc: string` - 幽默描述文案
  - `nextLevelValue: string` - 下一职级预估薪酬
  - `isUnlocked: boolean` - 是否已解锁深度报告
  - `abilities: Abilities` - 5能力详情
  - `radarData: RadarData` - 雷达图数据
  - `abilitySummary: string` - 能力总结

- [x] 新增接口定义：
  ```typescript
  interface AbilityItem {
    score: number;      // 0-100
    level: string;      // 'high' | 'medium' | 'low'
    explanation: string;
  }

  interface Abilities {
    专业力: AbilityItem;
    管理力: AbilityItem;
    合作力: AbilityItem;
    思辨力: AbilityItem;
    创新力: AbilityItem;
  }

  interface RadarData {
    专业力: number;
    管理力: number;
    合作力: number;
    思辨力: number;
    创新力: number;
  }
  ```

### 三、ResultView 大改造

**文件：`components/ResultView.tsx`**

- [x] 集成 Recharts 绘制能力雷达图
- [x] 主卡片展示：薪酬范围 + 职级标签 + 幽默描述
- [x] 根据职级动态切换主题色（emerald/blue/amber）
- [x] 实现付费解锁 UI：
  - 毛玻璃遮罩层
  - 解锁功能列表
  - 倒计时紧迫感
  - 社交证明轮播
  - 完整支付流程（选择方式 → 输入密码 → 验证 → 成功）
- [x] 职场进阶展望卡片（展示 nextLevelValue）
- [x] 分享报告功能（html2canvas 截图）

### 四、App.tsx 状态管理

- [x] 新增 `currentHistoryId` 追踪当前评估
- [x] `handleReportUnlock()` 解锁后同步更新历史记录
- [x] 历史记录点击后正确恢复 `isUnlocked` 状态

### 五、依赖更新

**文件：`package.json`**

- [x] 新增 `recharts: ^3.6.0` 用于雷达图

---

## 2025-01-23 (Day 2)

### 一、前后端数据对齐

**问题**：前端的城市和行业选项与后端不一致

**解决方案**：

#### 1. 城市：下拉选择 + 自动映射

**文件：`App.tsx`**
- [x] 保留下拉选择交互，新增常用城市列表
  ```typescript
  const CITIES = [
    "北京", "上海", "广州", "深圳",  // 一线
    "杭州", "成都", "武汉", "南京", "苏州", "天津", "重庆", "西安", "长沙", "青岛",  // 二线
    "其他"  // 三线
  ];
  ```

**文件：`services/geminiService.ts`**
- [x] 新增 `CITY_TIER_MAP` 城市分级映射表
- [x] 新增 `mapCityToTier()` 函数，自动转换城市等级
  - 一线城市：北京、上海、广州、深圳
  - 二线城市：杭州、成都、武汉、南京、苏州、天津、重庆、西安、长沙、青岛等24个城市
  - 三线城市：其他所有城市

#### 2. 行业：直接对齐后端

**文件：`App.tsx`**
- [x] 修改 `INDUSTRIES` 为后端支持的 11 个行业：
  ```typescript
  const INDUSTRIES = [
    "互联网", "高科技", "金融", "大健康", "地产",
    "汽车", "消费品", "新零售", "泛娱乐", "农业", "教育"
  ];
  ```

### 二、后端 LLM 调用验证

- [x] 确认当前后端只调用 **1 次 LLM**（不可量化模式）
- [x] 确认增量收敛引擎正常工作（响应时间约 5 秒）
- [x] 确认可量化逻辑虽保留但未使用（前端无入口），无需删除

### 三、后端详细日志输出

**文件：`mini_api.py`**
- [x] 新增评估结果详细日志，包含：
  - 岗位职级、薪酬范围、趣味标签
  - HAY 8因素档位（PK/MK/Comm/TE/TC/FTA/M/NI）
  - 8因素 → 分数转换过程
  - 5能力计算公式和结果

**日志示例：**
```
============================================================
【评估结果详情】
============================================================
岗位职级: 18
薪酬范围: 63万-77万
趣味标签: 商业操盘手
------------------------------------------------------------
【HAY 8因素档位】
  Know-How (知识技能):
    - PK  专业知识:     E+
    - MK  管理知识:     II
    - Comm 沟通技巧:    2
  Problem Solving (解决问题):
    - TE  思维环境:     E
    - TC  思维挑战:     3-
  Accountability (责任):
    - FTA 行动自由:     D+
    - M   影响范围:     N
    - NI  影响性质:     V
------------------------------------------------------------
【8因素 → 5能力 映射计算】
  因素分数转换:
    PK(E+)=65, MK(II)=50, Comm(2)=60
    TE(E)=60, TC(3-)=55
    FTA(D+)=55, M(N)=30, NI(V)=75

  能力计算公式 → 结果:
    专业力 = PK(100%)           = 65 → 65分
    管理力 = MK(70%) + FTA(30%) = 52 → 52分
    合作力 = Comm(80%) + NI(20%)= 63 → 63分
    思辨力 = TE(100%)           = 60 → 60分
    创新力 = TC(100%)           = 55 → 55分
============================================================
```

### 四、前端"各维度得分定义"卡片动态化

**文件：`components/ResultView.tsx`**
- [x] 修复分数显示：使用后端返回的 `result.abilities` 真实数据
- [x] 分数转换：百分制 → 十分制显示（除以10）
- [x] 描述动态化：使用后端返回的 `explanation` 字段
- [x] 标签动态化：根据分数生成对应标签

**能力标签映射规则：**

| 能力维度 | 高分 (≥70) | 中等 (50-69) | 待提升 (<50) |
|---------|-----------|-------------|-------------|
| 专业力 | 业界标杆 | 稳扎稳打 | 潜力新秀 |
| 管理力 | 统筹帷幄 | 团队骨干 | 蓄势待发 |
| 合作力 | 人脉达人 | 团队粘合 | 默默耕耘 |
| 思辨力 | 洞察先机 | 深度复盘 | 按部就班 |
| 创新力 | 破圈尝试 | 持续改进 | 稳中求进 |

### 五、了解后端标签生成逻辑

**文件：`level_tags.py`**

趣味标签（`levelTag`）和描述（`levelDesc`）生成规则：

1. **优先检查特殊能力**：
   - 所有能力 ≥60 → "六边形战士"、"全能选手"
   - 单项能力 ≥75 → 对应特殊标签（技术大牛、团队舵手等）

2. **按职级分配基础标签**：
   - 10-12级：搬砖新星、职场萌新、潜力原石
   - 13-15级：业务脊梁、搬砖圣手、效率达人
   - 16-18级：六边形战士、行业清流、职场卷王
   - 19-21级：架构大拿、战略先锋、行业布道者
   - 22+级：商界弄潮儿、资本宠儿、行业领袖

3. 同组内随机选择一个标签

---

## 待办事项 (TODO)

### 高优先级

- [x] ~~动态化"各维度得分定义"卡片~~ ✅ Day 2 已完成

- [x] ~~动态化"AI 深度评估"文案~~ ✅ 已使用后端 `abilitySummary` 动态展示

- [x] ~~8维能力模型适配~~ ✅ types.ts/ResultView/geminiService 全部更新为8维

- [x] ~~能力定级×市场定薪拆分~~ ✅ 后端新增 `marketSalary` + `abilityCompetitiveness`，前端适配

- [ ] **简历文件解析优化**
  - 当前：仅截取 base64 前500字符
  - 目标：后端真正解析 PDF/DOC 提取文本

### 中优先级

- [x] ~~优势/劣势（strengths/weaknesses）使用后端数据~~ ✅ geminiService 已基于 abilities 动态生成
- [ ] 错误提示优化（网络错误、后端超时等）

### 低优先级

- [ ] 微信真实登录集成
- [ ] 微信支付 SDK 集成
- [ ] 数据持久化（localStorage 或后端存储）
- [ ] 单元测试覆盖

---

## 后端 API 对接说明

### 评估接口

**POST** `/api/mini/assess`

**请求体：**
```json
{
  "assessmentType": "CV" | "JD",
  "city": "一线城市",  // 前端自动映射：上海→一线城市
  "industry": "互联网",  // 与后端保持一致
  "jobTitle": "高级产品经理",
  "jobFunction": "产品",
  "resumeText": "...",
  "jdText": "..."
}
```

**响应体：**
```json
{
  "success": true,
  "data": {
    "salaryRange": "25万-35万",
    "level": 14,
    "levelTag": "业务脊梁",
    "levelDesc": "你是团队的中流砥柱...",
    "abilities": {
      "专业力": { "score": 70, "level": "high", "explanation": "..." },
      "管理力": { "score": 60, "level": "medium", "explanation": "..." },
      ...
    },
    "radarData": { "专业力": 70, "管理力": 60, ... },
    "abilitySummary": "..."
  }
}
```

---

## 项目结构

```
value-assessment-system/
├── App.tsx                 # 主应用入口，状态管理
├── types.ts                # TypeScript 类型定义
├── services/
│   └── geminiService.ts    # API 调用服务（已改造）
├── components/
│   ├── ResultView.tsx      # 结果页（已改造）
│   ├── WelcomeView.tsx     # 欢迎页
│   ├── LoginView.tsx       # 登录页
│   ├── MineView.tsx        # 个人中心
│   ├── HistoryView.tsx     # 历史记录
│   ├── UnlockView.tsx      # 解锁/充值页
│   └── ...
└── package.json
```

---

## 备注

- 后端服务需先启动：`python mini_api.py`（监听 5001 端口）
- 前端开发服务：`npm run dev`（默认 3000 端口）
- 如需测试可切换 `USE_MOCK = true` 使用模拟数据

----angus自己敲的备注：
1）需要整理一个deepseek辣评，比如现在的“六边形战士”下面的描述过于简略了，字数可以多一些，这个由angus整理完之后，再请CC写成代码；
2）angus在考虑是不是要把deepseek chat模型换成deepseek reasoner模型，但似乎目前看来run的效果也还可以，而且因为暂不用调用deepseek产出什么文字相关的东西；哦不对，底下有一段话需要调用deepseek给建议的，需要决策一下；
