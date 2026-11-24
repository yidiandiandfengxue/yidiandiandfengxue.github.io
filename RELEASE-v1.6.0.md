# Oscar 作品集 · v1.6.0 更新记录与发版注意事项

- **发布版本**：`v1.6.0`（2026-11-24）
- **目标仓库**：`yidiandiandfengxue/yidiandiandfengxue.github.io`（默认分支 `main`）
- **线上地址**：<https://yidiandiandfengxue.github.io/>
- **本地源码主仓库**：`/Users/xiaojian.zhou/Desktop/design/oscar-site`

---

## 一、本次核心更新内容

### 1. 项目 6（iWork · 综合业务平台）静态界面全面替换为真实可交互原型
- **新增内嵌产物 `iwork-demo/`**：将新开发的 `iwork-app`（React + TypeScript + Vite，393×852 iPhone 14 Pro 规范）构建并部署至站点 `iwork-demo/` 目录（共 177 个静态资源），支持 `?embed=phone`（纯手机屏内嵌）与 `?theme=dark`（作品集深色编辑式演示台）双模式。
- **封面双机与 Hero 样机升级**：项目 6 封面双手机替换为实时可渲染页面（`#/home` 与 `#/metrics-detail`）；弹窗首屏 Hero 样机位置由 `top: 19%` 下移至 `top: 28%`，避免顶栏挤压。
- **图标规范与官方 App Icon Specimen（`#pdIcons`）**：补充官方 iWork 应用图标展示卡（64×64 容器规范与圆角标注），并将 12 枚业务图标替换为统一的 `#278AE0` 1.75px 双色线性 SVG。
- **交互界面 12 屏（`#pdIwork`）**：精选设计完成度最高的 12 个新建页面按视觉优先级置前展示，全部接入实时 `devices.css` iPhone 14 Pro 样机（`390×830`），配编辑式序号索引与动态 `NN#xx → 业务成效` 说明。
- **场景样机 4 屏（`#pdScenes`）与界面全景 12 屏（`#pdRailSec`）**：全面改为懒加载实时页面（`.pj-lazy-frame`），修复原 `.rail` 类名与侧边固定导航冲突导致的左侧叠影；移除过时的 32 张静态旧图墙（`#pdWall`）以及设计规范章内冗余样机图。

### 2. 新增「09 可交互原型」深色演示台（`#pdLiveProto`）
- **精简顶栏与深色渐变舞台**：深色模式下隐藏配色圆点、倍速条、原则开关和收起按钮，仅保留 `IPHONE 14 PRO · LIVE DEMO` 标题与「回桌面 / 停止演示」；背景升级为深空蓝 + 工业蓝/青绿/靛蓝分层光晕 + 32px 建筑细线网格。
- **8 组演示按钮一屏全显 + 设计原则联动**：8 个核心业务流程卡片一屏完整展示无需滚动；每个卡片附带等宽字体 UX 设计原则标签（如 `NN#01`、`NN#03`、`NN#05`、`NN#06` 等），顶部新增常驻「设计原则联动栏」，悬停预览成效、运行时同步显示当前步骤原则。
- **同心圆角与自适应防裁切**：外框容器 `18px`、主面板 `20px`、内部卡片/提示条 `12px`、按钮 `9px`、标签 `6px`；样机按 iframe 宽高联动缩放并同步收紧占位宽，右侧面板改为 `flex: 1 1 0` 自适应，解决窄屏右侧裁切与手机屏底部黑边问题。
- **重置按钮参数修复**：修复「重置原型」按钮拼接 `?r=` 导致覆盖 `?theme=dark` 参数的问题，改为自动判断 `?` / `&`。

### 3. iWork 原型自身体验升级（同步打包进 `iwork-demo/`）
- **视觉统一**：重构 AGV 调度中心与添加应用页图标，去除 AI 感彩虹渐变块，统一为白底浅冰蓝容器 + `#278AE0` 线性图标；全站 14 个二级页面统一为 24px 透明底矢量返回箭头。
- **首页 2×2 指标卡对齐与指标关注抽屉**：首页左侧指标卡精简为 2 项并与右侧两行图标上下像素对齐；指标监控页新增星标侧滑「关注 / 取消关注」抽屉与「已关注」筛选页签（`localStorage` 持久化）。
- **核心业务闭环**：待办列表点击消红点、去除列表误触审批、统一「去处理」进点检工单（支持同意/拒绝双态回写与电子签名）；云宝 AI 增加逐字流式输出与 3 列业务数据微卡；智慧工厂 13 项点位新增微趋势线与状态胶囊；iPhone 桌面校准为 64×64 官方图标。

### 4. 双钻架构图（04 设计流程 & 05 设计方向）排版精修
- **顶部四阶段左内边距**：为 `01 了解 / 02 定义 / 03 构思 / 04 交付` 统一补充 `20px` 左侧内边距，顶部青色节点与横线同步内移对齐。
- **左右副标题数学居中**：「为正确的事做设计」与「将设计做正确」改为按 SVG 菱形顶点精确中轴坐标（`32.0833%` / `67.9167%`）+ `translateX(-50%)` 居中。
- **底部提示条通栏单行**：`.ar-detail__hint` 增加 `grid-column: 1 / -1; white-space: nowrap`（移动端自动折行），消除 3 列网格导致的提前异常断行。

---

## 二、发版与后续维护注意事项（务必关注）

1. **严禁直接 `git push`（本机双限制）**
   - 本机代理会阻断 `github.com` 的 git 隧道（`CONNECT 502`），且公司 DLP 会对磁盘上的 `.html` / `.md` 进行透明加密，`git` 对象中保存的是密文；直接 push 会导致线上页面乱码。
   - **正确方式**：必须通过 `/usr/bin/python3 tools/release.py` 读取磁盘明文，经由 GitHub REST Git Data API（`api.github.com`）增量上传 blobs → tree → commit → `main` → tag → Release，并确保脚本内的 `assert_plaintext` 明文校验通过。

2. **Token 路径与沙盒权限**
   - `tools/release.py` 默认读取 `~/.workbuddy/gh_pat`（具备 `yidiandiandfengxue/yidiandiandfengxue.github.io` 仓库 Contents 读写权限的 fine-grained PAT）。
   - 如果在受限沙盒（如未挂载 `~/.workbuddy` 目录的 AI 会话）中运行，需要先授权目录或直接在本机终端执行发版命令。

3. **切勿推错仓库 / 分支**
   - 目标仓库固定为 **`yidiandiandfengxue/yidiandiandfengxue.github.io`** 的 **`main`** 分支（由 `tools/release.py` 顶部常量 `OWNER` / `REPO` 锁定，且 `force: False` 绝不强推）。
   - 推送前务必先执行 `python3 tools/release.py --dry-run` 核对线上 HEAD、变动文件清单与单文件大小（GitHub blob API 单文件须 < 38MB）。

4. **修改 `iwork-app` 后的联动与防缓存流程**
   - 每次修改 `/Users/xiaojian.zhou/Desktop/design/iwork-app` 后，必须重新执行 `npx tsc -b && node dev-local.mjs --build`，并将 `dist/` 全量明文同步到 `oscar-site/iwork-demo/` 及其他镜像目录。
   - 同步后建议同步递增 `index.html` 中 23 处 `iwork-demo/index.html?...&v=YYYYMMDDx` 的版本号参数（当前为 `v=20261123c`），避免浏览器对 iframe 强缓存旧版页面。

5. **内嵌样机 iframe 尺寸规则不可回退**
   - `oscar-site/index.html` 中原有 `.pd-x .scene-device .dvc-screen { height: auto }` 是针对静态 `<img>` 写的；对 `<iframe>` 必须保留 `iframe.dvc-screen--live { width: 390px !important; height: 830px !important; min-height: 830px !important; }`，否则浏览器会把 iframe 压扁成 `150px` 黑屏。
   - `iwork-app` 内 `.demo-phone-stage > .app-root` 必须保留 `height: 100% !important; max-height: none !important;`，避免 `100dvh` 在缩放 iframe 中产生底部黑边。

6. **三份本地源码镜像与离线版提示**
   - 本次已将 `index.html`、`CHANGELOG.md`、`RELEASE-v1.6.0.md`、`iwork-demo/` 同步至 `oscar-site/`、`oscar-site-github/`、`oscar-handoff/01-站点源码/site/` 及 `/tmp/oscar-preview/` 四处。
   - 注意：`deliverables/Oscar-离线版.html` 为旧版单文件离线包，因实时交互原型依赖 `iwork-demo/` 多模块运行，单文件离线版无法直接内联完整 React 路由应用，在线访问请以 GitHub Pages（`https://yidiandiandfengxue.github.io/`）或本地 HTTP 服务为准。
