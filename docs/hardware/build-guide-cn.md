# Tiny Engineer 国内建造指南（完整分析 + BOM + 执行方案）

> 基于本地仓库 `D:\projects\tiny-agent\tiny-engineer`（main 分支，commit `738d8d6`，2026-10-13）
> 固件版本：v0.2.0（已下载到 `D:\projects\tiny-agent\release-firmware\v0.2.0\`）
> 本文所有价格为参考估算（2026-10，人民币），以实际商品页/报价为准。

---

## 一、项目完整性分析

| 模块 | 内容 | 完整性 |
| --- | --- | --- |
| 固件源码 | `src/` ≈ 13,600 行 C++（Arduino + PlatformIO），动画引擎 / I2S 音频 / OLED 眼睛 / HTTP 服务 / 设置存储，另有 native 单元测试与 OTA 环境 | ✅ 完整 |
| 预编译固件 | Releases 提供 v0.1.0 / v0.2.0 的 bootloader + partitions + firmware + littlefs（CI 自动构建，含 manifest.json） | ✅ 已代下载 |
| 硬件设计 | KiCad 10 工程设计：主控板（原理图/PCB/自定义库/DRC 规则/网表断言 `expected-nets.yml`，CI 跑 ERC/DRC 校验）+ compact-carrier-board | ✅ 源码级完整（见下注意点） |
| 3D 模型 | 参数化 Fusion 源文件（`.f3d`）+ 4 种舵机预设的 3mf/stl/step，25 个独立零件 + 2 个测试件；装配照片 20+ 张 | ✅ 完整 |
| 文档 | getting-started 全流程 / shopping / 硬件 10 篇 / 组装 20 节 / testing / API（40KB）/ integration / hooks / robot-movement / PCB 规范 / 面向程序员电子学入门 | ✅ 质量罕见地高 |
| 客户端 | npx CLI（Claude Code / Cursor / Antigravity 一键接入）+ REST API（任何 agent 可 POST） | ✅ 完整 |
| 许可 | 软件 MIT；硬件 CERN-OHL-S-2.0（可商用，改后分发需开源）；商标保留 | ✅ 清晰 |

**结论：这是一个"可复现级"的完整工程，不是半成品。** 代码、图纸、文档、预编译固件齐备；唯一需要你自己完成的三件事是外部制造：**打板/贴片、3D 打印、买件**。

**注意点（诚实清单）**
1. 主控板 README 自述状态：*draft（draft = 原理图+布线完成，作者尚未打样/实测）*。设计有 CI 校验、有 rev-2 预览图，但打板存在设计风险，文档也明确提示"自担风险"。社区曾讨论整批代做（discussion #50），目前无官方成品板出售。
2. compact-carrier-board（紧凑版载板）曾发运过一批"插槽行镜像"缺陷板，源头已修复，与主控板路线无关。
3. 官方网页刷机站依赖 GitHub Pages（`jamro.github.io`），**国内 DNS 被污染**，需代理或走离线刷机（见方案阶段 5）。
4. 音频为固定 WAV 素材（随固件打包），蓝牙不在项目范围，Wi-Fi 仅 2.4GHz。

---

## 二、是否适合"手搓"

**适合，难度中等**（作者自评 Medium："软件工程师的第一个硬件项目，不是点个 LED 那种玩具"）。整个项目已把所有"设计工作"做完，你只需要：买、焊一点/插线、打印、装、刷、调。

两条路线任选：

| | 路线 A：打板+贴片（最接近原版） | 路线 B：模块飞线（免打板） |
| --- | --- | --- |
| 电子件 | 主控板（嘉立创打样 + 经济型 SMT 贴片） | 市售 PCA9685 模块 + MAX98357A 模块 + USB-C 分线板 |
| 需要焊接 | 仅焊 2 条 1×9 母座排针（插 ESP32 用） | 分线板/接线头处少量焊线（视物料而定） |
| 文档 | `docs/hardware/main-control-board.md` | `docs/hardware/wiring.md`（含完整接线表）+ `docs/3d/assembly-modular.md` |
| 成本 | 高一点（含 SMT 工程费） | 更低、更快 | 
| 风险 | 板子为 draft 状态，若设计有坑需自行排查 | 全部用成熟模块，电气上最保险 |

**不需要**：写固件、画板、改代码（除非接自己的 agent 想自定义动作）。
**难点排序**：供电系统 > 舵机中位与装配顺序 > 喇叭 BTL 接线 > 其余。

---

## 三、完整 BOM

### 3.1 电子与紧固件（默认购物车）

| # | 项目 | 数量 | 规格要点 | 建议渠道 | 参考价 |
| --- | --- | --- | --- | --- | --- |
| 1 | 主控板 PCB + 贴片 | 1 片 | 嘉立创：2 层/1.6mm，开 SMT 经济型单面；5 片起（约 ¥5-30 板费 + SMT 工程费 ¥50 + 焊点费 ¥0.1/点 + 元件费） | 嘉立创 jlc.com / jlc-smt.com | 约 ¥100-200/批 |
| 2 | Waveshare ESP32-C3-Zero | 1 | **买带排针版（C3-Zero-M，SKU 25532）**或自焊排针；板上是 2×9 母座 | 微雪官网 waveshare.net / 淘宝旗舰店 | ~¥25（海外 $3.49-4.49） |
| 3 | SG90 9g 舵机 | 5 | **同款同批**（"or equivalent 9g analog micro"），与打印件预设 `sg90` 对应 | 淘宝 | ~¥6-8/只 |
| 4 | OLED 0.91" | 1 | SSD1306，**128×32**，I2C，4 针（VCC/GND/SDA/SCL） | 微雪 / 淘宝通用模块 | ~¥10-15 |
| 5 | 喇叭 | 1 | 8Ω 1W 单声道，可替代 Adafruit 原版；接线看 §五-5 | 淘宝 | ~¥3-6 |
| 6 | M2 螺丝+螺母套装 | 1 套 | M2×4 ×8、M2×8 ×27、M2×16 ×15、M2 螺母 ×6；**盘头/半圆头自攻**，装底盖的螺丝头径≤4.0mm、高≤2.0mm | 淘宝 | ~¥10-20 |
| 7 | 5V/≥2A USB 电源 | 1 | 弱充电器会在五舵机同动瞬间拉崩（brownout） | 现有/淘宝 | ~¥15-25 |
| 8 | USB-C **数据**线 | 1 | 充电线不行，必须能传数据 | 现有/淘宝 | ~¥5-10 |

### 3.2 3D 打印件（按 `sg90` 预设，25 件）

- **自打**：PLA 或 PETG；3 色分组（黑 / 丝光铜 / 白透）× ；**先打 2 个测试件**（`ServoSizingTester.3mf` 验舵机仓位、`ScrewSizingTest.3mf` 验 M2 螺丝孔），再打全套。
  - 用 `.3mf`（已含打印摆位，无需支撑）。若有 Fusion 360：按测试件结果设 `screw_thread_diameter` 后重导出；没有 Fusion 也完全可以先打，孔松/紧可用胶带缠绕螺丝或少量扩孔微调（`docs/3d/order-parts.md` 有说明）。
  - 耗材量：用切片软件（Bambu Studio / Orca / PrusaSlicer）加载 3mf 自查克重与时长；总件数多但单件都不大。
- **代打**：嘉立创3D打印（jlc-3dp.cn）、PCBWay（官方文档实测过）、淘宝代打。
  - 只上传 3 个整组文件：`PartsSetA.stl`（铜色）、`PartsSetB.stl`（黑色，最大盘约 235×332mm）、`LampDiffuser.stl`（白色/半透，可能需接受薄壁风险条款）；PLA、20% 填充、不要攻丝、单位 mm。
  - 参考价：一套约 ¥150-400（以平台报价为准）。

#### 颜色分组（官方三色，已按零件逐一核对）

| 颜色 | 零件 |
| --- | --- |
| **丝光铜 Silk Copper**（11 件，= `PartsSetA`） | Head（头）· Chest（胸/躯干）· Hat（帽）· AiEmblem（胸前 AI 徽标）· DeskPad（桌垫）· LaptopCase（笔记本外壳）· Mug（杯子）· Bell（铃铛）· LampBase（灯座）· LampCap（灯罩）· LampButton（灯按钮） |
| **黑色**（13 种文件 / 14 件，= `PartsSetB`） | Neck（脖子）· Belly（肚子）· **UpperArm ×2**（上臂，需打两个）· ForearmLeft / ForearmRight（左右前臂/手）· Chair（椅架）· SeatLeft / SeatRight（左右椅面）· Desk（桌体）· DeskTop（桌面）· BottomCover（底盖）· LaptopScreen（笔记本屏幕）· Coffee（咖啡） |
| **白色/半透明**（1 件） | LampDiffuser（灯罩扩散片，故意做薄以透光） |
| **测试件（任意余料）** | ServoSizingTester（验舵机仓位）· ScrewSizingTest（验 M2 螺丝孔） |

合计：25 种文件 → **26 个打印件**（上臂打 2 个）+ 2 个测试件。3mf/stl 文件本身不含颜色信息，颜色纯粹由你打印时决定（官方三色只是推荐）；同一盘不要混色。

### 3.3 路线 B 追加（免打板才需要）

| 项目 | 规格 | 参考价 |
| --- | --- | --- |
| PCA9685 16 路舵机驱动模块 | 地址 0x40（默认即可） | ~¥10-15 |
| MAX98357A I2S 功放模块 | 3.3V 逻辑，Vin 接 5V | ~¥6-10 |
| USB-C 母座分线板 | 带 CC 电阻（或直接焊线到 C3-Zero 5V/GND）| ~¥5-10 |
| 杜邦线/硅胶线若干 | 母-母、公-母 | ~¥10 |

### 3.4 工具

十字螺丝刀（PH0/PH1）、镊子/剪钳；（路线 A 或 B 会焊线的场景）电烙铁 + 焊锡；刷机用 Chrome/Edge 浏览器。

### 3.5 主控板上的贴片元件（打板路线，嘉立创下单用）

不必自己买——用 KiCad 导出的 `bom.csv` 直接传给嘉立创。核心元件（LCSC 立创编号，供核对库存）：

| 元件 | 型号 | LCSC |
| --- | --- | --- |
| 舵机驱动 | PCA9685PW,118 | C2678753 |
| 功放 | MAX98357AETE+T | C910544 |
| eFuse（舵机限流~2A） | TPS259571DSGR | C471038 |
| USB-C 母座 | TYPE-C 16PIN 2MD | C2765186 |
| 自恢复保险 | 3A PPTC | C883162 |
| 大电容 | 1000µF | C46550395 |
| ESP32 母座 ×2 | 1×9 2.54 母排 | C2897372 |
| 舵机排针 | HX PZ2.54-3×5P | C32713292 |
| 喇叭座 / OLED 座 / 扩展座 | 1×2 / 4P / 4P | C2845379 / C2691448 / C160404 |
| 阻容 | 220Ω×5、100nF×4、1k×2、4.7k×2（I2C 上拉）、5.1k×2（CC）、10k、1M、2.2k | 见板文件 |

总额外成本约 ¥30-60（元件），以嘉立创实时报价为准。

---

## 四、执行方案（分阶段）

### 阶段 0 · 准备（已完成 ✅）
- 仓库：`D:\projects\tiny-agent\tiny-engineer`（完整克隆，含历史）
- 固件：`D:\projects\tiny-agent\release-firmware\v0.2.0\`（5 个文件已下载并校验）
- 网络备忘：直连 GitHub 仅 ~64KB/s；走本机 Clash 代理 `127.0.0.1:7897` 达 ~3MB/s。所有 git 命令建议：
  `git -c http.proxy=http://127.0.0.1:7897 -c http.version=HTTP/1.1 <命令>`
  （TLS 握手偶发失败，重试即可）

### 阶段 1 · 采购（3-7 天，与阶段 2/3 并行）
按 §三 下单。重点核对：舵机 5 只同款、ESP32 带排针、OLED 128×32、电源 5V≥2A、数据线。

### 阶段 2 · 电路（路线 A 打板 / 路线 B 免板）
**路线 A**（约 1 周，含贴片）：
1. 用 KiCad 10 打开 `hardware/boards/main-control-board/main-control-board.kicad_pro`，装 Fabrication Toolkit 插件，导出：Gerber ZIP + `bom.csv` + `positions.csv`。
2. 嘉立创下单：PCB（FR-4/2 层/1.6mm）→ 勾选 SMT 贴片 → 经济型、单面（Top）→ 上传 gerber/bom/positions → **逐行核对 BOM**（多候选物料手动指定）→ 付款。
3. 收货检查虚焊/偏移 → 焊上 2 条 1×9 母座（插 ESP32 用）。

**路线 B**：跳过，按 `docs/hardware/wiring.md` 直接接线（顺序：**GND → 信号 → 3V3 → 5V 最后**）。

### 阶段 3 · 打印（1-3 天自打 / 3-7 天代打）
先打 2 个测试件验配合，再打全套或送代打（§3.2）。

### 阶段 4 · 接线（桌面完成，电子件先不入壳）
按 `docs/hardware/main-control-board.md`（路线 A）或 `wiring.md`（路线 B）。上电前检查：
- 喇叭只接 **SPK+/SPK−** 且仅一种方式（座子或焊盘，不可同时）
- 舵机先不插（刷机后先做中位）
- ESP32 方向对准 PCB 丝印 USB 标记；天线区不要压金属
- 3V3 只带逻辑（PCA9685 VCC、OLED），**舵机绝不接 3V3**

### 阶段 5 · 刷机（桌面，未装壳）——验收后才继续
**离线刷机（国内推荐，已验证可行）**：装 esptool 后用已下载的固件：
```bash
pip install esptool
cd D:\projects\tiny-agent\release-firmware\v0.2.0
python -m esptool --chip esp32c3 write_flash ^
  0x0 tiny-engineer-v0.2.0-bootloader.bin ^
  0x8000 tiny-engineer-v0.2.0-partitions.bin ^
  0x10000 tiny-engineer-v0.2.0-firmware.bin ^
  0x220000 tiny-engineer-v0.2.0-littlefs.bin
```
（bash 环境用 `\` 续行；需 USB-C 数据线接主控板/ESP32。）
- **备选 1**：官方网页刷机 `https://jamro.github.io/tiny-engineer/flash/` ——需浏览器走代理（该域名国内 DNS 被污染，且页面依赖 unpkg.com）。
- **备选 2**：源码编译 `pio run -t upload`（pioarduino + Node 20.19+/22.12+，用于改固件/音频 mod/OTA）。

**验收（"Done when"）**：板载 RGB 暗绿灯（不是红色闪码：1 闪=PCA9685 未找到，2 闪=I2S 失败）→ 连 `TinyEngineer-XXXX` 热点 → `http://192.168.4.1/config` → 按 **Move all to 90°** 让舵机中位。
⚠️ **先别完成 Wi-Fi 向导**（家庭 Wi-Fi、舵机范围、OLED、音量留到装壳后的 §20）。

### 阶段 6 · 机械装配（一个晚上，2-4 小时）
按 `docs/3d/assembly.md` 20 节走：Head/Hat →（每个舵机先 90° 中位，装完拔线）Neck→Head→Chest 侧舵机→Belly→Chair → 桌子堆叠 → 电子件入壳（§12-13）→ 插回舵机/OLED 通道（§15）→ 底盖 → 双臂 → 灯（§19）。
要点：中位由"Move all to 90°"完成；螺丝旋入塑料不要过拧；舵机线最后按通道 0-4 接回。

### 阶段 7 · 首启与校调
`assembly.md` §20：完整跑向导（家庭 **2.4GHz** Wi-Fi、舵机安全范围、OLED 朝向、音量、扬声器测试）→ 重启 → OLED 显示 IP。
```bash
curl http://tiny-engineer.local/health        # 或换成 OLED 显示的 IP
curl -X POST http://tiny-engineer.local/test/movement
curl -X POST "http://tiny-engineer.local/anim?name=ring"
```

### 阶段 8 · 接入 AI Agent
```bash
npx -y tiny-engineer setup     # Claude Code / Cursor / Antigravity 一键配置 hook
```
其他 agent（含 Hermes）直接 `POST /anim?name=typing` 等即可，接口见 `docs/api.md`。
（可选加购：我可以给 Hermes 写一个动作 hook 脚本，让每次任务完成时机器人摇铃。）

### 可选进阶
OTA 双槽固件（`pio run -e ota -t upload`）· 万圣节 mod（`mods/halloween`，含南瓜打印件）· 参数化改款（换舵机尺寸/Fusion 源文件）。

**总周期估计**：约两周（物流主导）；动手时间约 1-2 个晚上 + 调试半天。

---

## 五、避坑清单（重要）

1. **网页刷机**：`jamro.github.io` 国内 DNS 污染（解析到 198.18.x.x 假地址）——用离线 esptool（已验证）或在浏览器配置代理。
2. **GitHub 慢**：直连 64KB/s vs 代理 3MB/s；TLS 偶发握手失败，重试 + `http.version=HTTP/1.1`。
3. **主控板是 draft**：作者未打样实测，打板风险自担；想稳妥可走路线 B，或等社区批次。
4. **供电是最大坑**：5V≥2A，且注意板载 eFuse 限流 ~2A——五舵机同时堵转可能先触发限流/复位。
5. **喇叭 BTL 输出**：SPK− 不是地！不要接 GND，不要同时用连接器和焊盘。
6. **舵机**：5 只同型号；只接 PCA9685 V+（+5V），不接 3V3。
7. **mDNS 不稳**：`tiny-engineer.local` 失败时用 OLED 上的 IP 或 `curl -4`。
8. **别提前完成刷机向导**：装壳前只做中位，向导留给 §20，否则舵机范围按装壳前状态标定。
9. **底盖螺丝**：头径 ≤4.0mm × 高 ≤2.0mm（沉孔限制）。
10. **装配照片**：`docs/3d/assembly_visuals/` 有每步实拍图；卡住先看图。

---

## 六、关键路径索引（仓库内）

| 需要什么 | 路径 |
| --- | --- |
| 总流程 | `docs/getting-started.md` |
| 购物清单（原文） | `docs/shopping.md` |
| 主板连接 | `docs/hardware/main-control-board.md` · 打板下单 `docs/hardware/order-main-control-board.md` |
| 模块飞线（路线 B） | `docs/hardware/wiring.md` + `docs/wiring/Tiny Engineer.drawio.png` |
| 引脚/供电/舵机/测试 | `docs/hardware/pinout.md` · `power.md` · `servos.md` · `testing.md` |
| 刷机 | `docs/flash.md`（离线命令在本文 §阶段5） |
| 组装 | `docs/3d/assembly.md`（§1-20）+ `assembly_visuals/` 照片 |
| 打印件 | `3d_models/README.md` · `3d_models/parts/sg90/3mf/` |
| 代打印 | `docs/3d/order-parts.md` |
| API / 集成 | `docs/api.md` · `docs/integration.md` |
| 动作与舵机范围 | `docs/robot-movement.md` · `include/servos.h` |

---

## 七、批量成本核算（按 5 台，自打打印按 ¥10/台计）

| 项目（每台） | 参考价 |
| --- | --- |
| ESP32-C3-Zero-M | ¥22-28 |
| SG90 舵机 ×5 | ¥30-40 |
| OLED 0.91″ | ¥10-15 |
| 喇叭 8Ω1W | ¥3-6 |
| M2 螺丝（摊薄） | ¥3-5 |
| 5V/2A 电源 | ¥15-25 |
| 3D 打印（自打） | ¥10 |
| **共用小计** | **¥93-129** |

- 方案 A 追加：主控板 PCBA ¥35-60/台（¥50 工程费÷5 + PCB ¥2-6 + 元件 ¥15-28 + 焊点 ¥10-15）
- 方案 B 追加：PCA9685 模块 ¥10-15 + MAX98357A 模块 ¥6-10 + USB-C 分线板 ¥5-10 + 杜邦线 ¥5-10 = ¥26-45/台

| 方案 | 单台均价 | 5 台合计 |
| --- | --- | --- |
| A（打板贴片） | 约 ¥130-190 | ¥640-945 |
| B（模块飞线） | 约 ¥120-175 | ¥595-870 |

说明：嘉立创 5 片起订量正好对应 5 台；复用现有电源/数据线可再省 ¥15-30/台；打印 ¥10/台为指定值，实际耗材建议切片核实后替换（每台 +¥20 则 A 约 ¥150-210/台）。

---

*本指南由 Hermes 基于仓库实际文件分析生成；价格为参考估算，下单前请以商家实时报价核对。*
