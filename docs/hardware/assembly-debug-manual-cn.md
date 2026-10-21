# Tiny Engineer 组装 + 调试手册（中文合并版）

> 🖼 **带图版本（推荐）**：同目录双击 **`assembly-manual.html`** —— 浏览器直接打开，21 张实拍图按步骤内嵌排版，`Ctrl+P` 可存 PDF。
> 本文件是纯文字版；文中 "— `xxx.jpg`" 对应的照片已复制到 **`assembly-images/`**（与两个文件同目录）。
>
> 依据仓库官方文档整理：`docs/3d/assembly.md`（20 节 + 底盖，21 张实拍图）、`docs/hardware/testing.md`、
> `docs/hardware/power.md`、`docs/hardware/servos.md`、`docs/robot-movement.md`、`docs/getting-started.md`、
> `docs/3d/assembly-modular.md`。路线 A（主控板）为准；路线 B 的差异处已单独标出。

---

## 0. 开始之前（顺序不能乱）

```
接线/焊线 → 刷固件 → 桌面调试（中位）→ 机械装配 → 装壳 → 向导校准 → 验收
```

- 电子件与舵机**先在桌面上**完成接线和刷机；**装配期间电子件不入壳**，直到 §12。
- 每次"中位"操作：只插一个舵机 → 上电 → 连 `TinyEngineer-XXXX` → `http://192.168.4.1/config` → **Move all to 90°** → **拔掉舵机线**再继续装。
- ⚠️ **中位阶段绝对不要完成 Wi-Fi 向导**（舵机范围、OLED、LED、音量、家庭 Wi-Fi 都留到装完壳的 §20）。
- 需要的工具：PH0/PH1 十字螺丝刀、M2 螺丝套装、5V/≥2A 电源、USB-C **数据**线、镊子。

---

## 1. 装配总览（build map）

| 阶段 | 内容 | 图 |
| --- | --- | --- |
| 1–2 | Head + Hat（OLED + 头部舵机） | head_1.jpg / head_2.jpg |
| 3–4 | Neck 中位 → 与 Head 合体 | neck_1.jpg / neck_2.jpg |
| 5–6 | Chest 两侧舵机 → 头组件上 Chest | chest_1.jpg / chest_2.jpg |
| 7–8 | Belly（最后一个舵机）→ 穿线合体 | belly_1.jpg / belly_2.jpg |
| 9 | 身体坐进 Chair | chair_1.jpg |
| 10–11 | 桌面堆叠 + 徽标 | desk_1.jpg / emblem_1.jpg |
| 12–13 | 电子件入壳 → ESP32 + 冒烟测试 + LampBase | electronics_*.jpg |
| 14 | 桌面道具（笔记本/杯子/铃铛） | desk_2.jpg |
| 15 | 插回舵机 + OLED（通道顺序） | electronics_3.jpg / electronics_3b.jpg |
| 16 | Chair ↔ Desk 合体 + 底盖 | body_1.jpg |
| 17–18 | 手臂（肘关节）→ 装到胸舵机 | arms_1.jpg / body_2.jpg |
| 19 | 台灯（压配） | lamp_1.jpg |
| 20 | 向导 + 首启 | — |

---

## 2. 逐步装配

### §1 Head —— OLED + 1 号舵机
1. 撕掉 OLED 保护膜。
2. **先把 OLED 排线插上**，再把它放进头壳（装进去后手够不到接口）。
3. 取 1 个舵机（**先不装舵盘**，方向随意），与 OLED 一起放进 `Head` 对应仓位。
4. 两根线从壳体两侧开口引出，卡进头壳背面的线卡。 — `head_1.jpg`

### §2 Hat
- `Hat` 扣在头上，**2× M2×8**，拧进塑料即可，别过拧。— `head_2.jpg`

### §2a 中位窗口（关键流程）
- 电子件留在桌上。给这一个舵机做中位（见 §0 操作），做完拔线。
- 之后每个"中位"步骤都照此办理。

### §3 Neck
1. 第 2 个舵机（不装盘）→ **中位**。
2. `Neck` 压到舵机轴上，与舵机本体**垂直**；中部凸起朝舵机长端（线缆侧，即背面）。
3. 用**舵机自带螺丝**固定。
4. 在 `Neck` 的六角槽放 1× **M2 螺母**：用**大孔**那个槽（在机器人右侧）；小孔槽留空（以后装舵机用）。
5. 拔线。— `neck_1.jpg`

### §4 Neck 与 Head 合体
1. 给头里的舵机做**中位**。
2. 两段式：先让 `Neck` 套上头部舵机轴 → 再往里推，直到螺母侧与 `Head` 齐平、与侧面安装孔对正（螺母别掉）。
3. **90° 时 Neck 必须垂直于 Head**，不对就先调再拧。
4. 固定：机器人右侧 **M2×8** 拧进captured 螺母；机器人左侧用**舵机自带螺丝**。
5. 拔线。— `neck_2.jpg`

### §5 Chest 两侧舵机
1. 取 `Chest`，左右侧仓各放 1 个未用舵机（不装盘，方向随意）。
2. 每根线从前部**竖直隧道**穿下去，从**底部**出来。
3. 每个舵机 2 颗，共 **4× M2×16**，别过拧。— `chest_1.jpg`

### §6 头组件装到 Chest
1. `Neck` 上那颗舵机进 `Chest` **中央仓**。
2. **先穿线**（中央隧道 → 底部）再坐进去。
3. 头/颈的"脸"与胸前脸同向（有线隧道那一侧）。
4. **2× M2×8**（优先两颗；太紧就只上背面 1 颗）。— `chest_2.jpg`

### §7 Belly（最后一个舵机）
1. 最后 1 个舵机 → **中位**。
2. `Belly` 压到舵机轴上（专用仓，不装盘）；舵机与 `Belly` **垂直**，长端朝 `Belly` 圆弧侧。
3. **舵机自带螺丝**固定，拔线。— `belly_1.jpg`

### §8 胸线穿 Belly 并合体
1. `Chest` 底部 3 根线（颈 + 左右手）：从 `Belly` **上方大孔**进、**下方侧孔**出。
2. 保持离开 `Chest` 时的 左 → 颈 → 右 顺序（只是识别用，不是通道号）。
3. `Belly` 圆弧朝**后**，贴合 `Chest` 轮廓，**4× M2×8**。— `belly_2.jpg`

### §9 身体坐进 Chair
1. `Belly` 舵机进 `Chair` 专用仓，脸朝前（坐姿方向）。
2. 舵机线走 `Chair` 竖直隧道到椅子下方。
3. `SeatLeft` / `SeatRight` 从两侧滑入卡住身体舵机（防止掉出），**注意别压线**。
4. 两个椅面之间 **2× M2×16**。— `chair_1.jpg`
> 到此主身体完成，先放一边。

### §10 桌面堆叠
1. `DeskTop` 嵌进 `DeskPad`，整体放在 `Desk` 上，**圆缺口朝机器人**。
2. 四角 **4× M2×16**。— `desk_1.jpg`

### §11 桌面徽标
- `AiEmblem` 放桌面正面，**2× M2×4**。— `emblem_1.jpg`

### §12 电子件入壳
**路线 A（主控板）**
1. 主控板坐进桌腔。
2. 舵机、OLED **先不插**（§15 才插）。
3. 喇叭接到座子**或**焊盘（**二选一**），塞进桌腔合适位置。
4. ESP32 先不装（§13 从桌面上方嵌）。

**路线 B（模块）** —— 用 `assembly-modular.md` 替换本节与 §13：
1. USB-C 分线板：**4× M2×16 + 螺母**固定在桌腔。
2. PCA9685：**4× M2×4** 固定到桌内前壁导轨。
3. MAX98357A：**2× M2×4** 固定在同一内侧壁导轨。
4. 喇叭贴内壁/松散放。
> 顺序按 USB → PCA9685 → 功放 → 喇叭，后装的别挡住先装的。

### §13 ESP32 + 上电冒烟测试 + LampBase
1. ESP32-C3-Zero 从**桌面上方**嵌入：引脚穿过桌面开孔、插进下方排针；按板丝印 **USB** 标记定向；模块应与桌面齐平、不凸出。
2. **冒烟测试（推荐）**：确认排针方向 → 上电（走主控板/分线板 USB-C）→ 灯亮 + 起 `TinyEngineer-XXXX` 热点 → 正常后**断电**。
3. `LampButton` 放在 `LampBase` 下方（从上方按 ESP32 **复位键**用）。
4. `LampBase` 开口对准 ESP32 状态灯，**2× M2×8** 固定在桌面上（同时压住 ESP32）。

### §14 桌面道具
1. **笔记本**：`LaptopScreen` 滑进 `LaptopCase` 底面槽，放桌面，**1× M2×8 从桌下**拧。
2. **杯子**：`Coffee` 放进 `Mug`，同样 **1× M2×8 从桌下**拧。
3. **铃铛**：先把 **M2×16** 完全拧进 `Bell`，再从桌面上方拧下去、桌下加 **M2 螺母**。— `desk_2.jpg`

### §15 插回舵机 + OLED（本步最容易接错）
把桌子前倾，让排针朝上：
1. 所有舵机线 + OLED 线插到标好的排针。
2. **通道顺序（硬性）**：

| 通道 | 关节 |
| --- | --- |
| 0 | 头（俯仰） |
| 1 | 颈（左右转） |
| 2 | 左手 |
| 3 | 右手 |
| 4 | 躯干（左右转） |

3. 上电做"舵机 + OLED"冒烟测试：动作正常、屏幕有显示、不复位。异常**先断电**再换插。
> 路线 B：插到 PCA9685 的通道排针。— `electronics_3.jpg`（路线 A）/ `electronics_3b.jpg`（路线 B）

### §16 Chair 与 Desk 合体
- 桌子推近椅子，孔位对正，每侧 3 颗共 **6× M2×8**；别硬怼，线缆避开螺丝路径。— `body_1.jpg`

### 底盖 BottomCover
1. **先**接完线、上完 6 颗侧螺丝，断电、托住翻面（别压手臂和桌面道具）。
2. 椅子的线走既有隧道进桌腔，线圈在周界内，**避开 6 个螺丝孔路径**，不能夹线。
3. 用**新版 Chair**（后壁下方有 2 个加固盲孔）；老版无孔需重打。
4. 底盖平面贴桌/椅，凹坑朝外；对齐 **4 个桌面孔 + 2 个椅后孔**。
5. **6× M2×8** 盘头/半圆头（头径 ≤4.0mm、高 ≤2.0mm），无螺母；拧到头顶进凹坑、不凸出底面。
6. 打印时**贴合面朝下、凹坑朝上**，无支撑。

### §17 手臂（肘关节）
- 左右各：`ForearmLeft`/`ForearmRight` + `UpperArm`，肘部 **1× M2×8**；**打两个 UpperArm**。
- 此步只做臂组件，**先别装到胸舵机**。— `arms_1.jpg`

### §18 手臂装到胸舵机
1. 先给两侧（手）舵机**中位**。
2. 臂组件压上舵机轴（UpperArm 有专用仓）。
3. 90° 时手在肩高、前臂朝前（朝桌子）。
4. 用**舵机自带螺丝**固定，两侧同样。
5. 不完美没关系，§20 校准会修。— `body_2.jpg`

### §19 台灯（压配，无螺丝）
- `LampCap` 套 `LampDiffuser` → 整体压进 `LampBase` 开口。— `lamp_1.jpg`

---

## 3. 校准与首启（§20 向导）

1. 上电 → 起 `TinyEngineer-XXXX` → 手机/电脑连上 → 打开 `http://192.168.4.1/config`。
2. 走完整个向导：
   1. **舵机安全范围**：90° 状态下已装好件，逐个关节标 min/max（恢复出厂会保留范围）。
   2. **OLED 旋转**：字反了就点 Rotate 180°。
   3. **RGB 顺序**：点 R/G/B 看灯色，不对再改（默认 GRB）。
   4. **喇叭**：播欢迎音。
   5. **主机名 + 家庭 Wi-Fi（只支持 2.4GHz）**。
3. 完成后**断电再上电**，机器人应自动连家里网络。
4. 验证：
```bash
curl http://tiny-engineer.local/health
curl -X POST "http://tiny-engineer.local/anim?name=ring"
```
> Wi-Fi 之后**不能**在普通 Config 页改，只能恢复出厂重新配。

---

## 4. 每次上电前自检（装壳/改线后必做）

- 喇叭只接 **SPK+/SPK−**，座子与焊盘**二选一**；SPK− **不是地**。
- 舵机插头方向与丝印一致；ESP32 方向与 PCB USB 标记一致。
- 5V/≥2A 供电；不要同时插两个 5V 源。
- 路线 B 额外用万用表确认：PCA9685 **VCC≈3.3V**、舵机端 **≈5V**、两路**不短路**、所有 GND 共地。
- 上电只看三件事：**暗绿灯**（不是红闪）、**热点是否出现**、**OLED 有无显示**。

---

## 5. 调试手册

### 5.1 正常启动时序（串口 115200）
`TINY ENGINEER` → 版本号 → I2C（SDA=GP0/SCL=GP1）→ **PCA9685 @0x40 必须成功** → OLED @0x3C（失败仅警告）→ 加载设置 → 进度屏/Wi-Fi → I2S 初始化 → 舵机 35°/s 缓动到中位 → `ROBOT READY` → 打印 HTTP 地址。
串口默认关闭（`serial_log` 关），所以**没有串口时靠 RGB 灯判断**。

### 5.2 红灯闪码（致命错误，会挂起）
| 闪几下 | 含义 |
| --- | --- |
| 1 | I2C 0x40 找不到 PCA9685（接线/地址/VCC） |
| 2 | MAX98357A / I2S 初始化失败（GP2/3/4） |

节奏：亮 300ms / 灭 300ms，循环间隔 3s。

### 5.3 HTTP 自测（有副作用，用 POST）
```bash
curl http://tiny-engineer.local/health
curl -X POST http://tiny-engineer.local/test/audio      # 500/700/1000Hz
curl -X POST http://tiny-engineer.local/test/screen     # OLED 测试图
curl -X POST http://tiny-engineer.local/test/movement   # 五舵机 ±范围测试
curl -X POST http://tiny-engineer.local/test/led        # RGB 走一遍
curl -X POST "http://tiny-engineer.local/test/servo" -H "Content-Type: application/json" -d '{"index":0,"angle":90}'
```
> `/test/movement` 是**最耗电瞬间**（五个舵机同动）；若串口/热点在这一刻掉线，是**欠压**，不是 PWM 问题。

### 5.4 故障速查
| 现象 | 原因 | 处理 |
| --- | --- | --- |
| OLED 提示 `OLED not found`，其余正常 | 0x3C 无应答 | VCC=**3V3**、GND、SDA=GP0、**SCL**=GP1、地址跳线 |
| 红灯 1 闪 + 卡死 | PCA9685 未找到 | VCC 接 3V3（**不是 V+**）、SDA/SCL、A0–A5 接地/地址 |
| 红灯 2 闪 + 卡死 | I2S 失败 | GP2/GP3/GP4 → BCLK/LRC/DIN；别短到 5V/GND |
| 动作正常但没声音 | 功放/喇叭/LittleFS | 功放 Vin=5V；喇叭只在 SPK±；用同版本重刷（含 LittleFS） |
| 舵机抖/弱/复位 | 供电不足 | 5V≥2A；eFuse ~2A 限流；线径；五舵机同动 |
| `.local` 打不开 | mDNS | 用 OLED 上的 IP；`curl -4` |
| OLED 显示 Join AP / 192.168.4.1 | 未连上家网 | 重走向导（2.4GHz） |
| 提示 `wifi not configured`（503） | 尚未保存 Wi-Fi | 先完成向导 |
| agent hook 不动 | Node/超时 | Node 18+；hook timeout ≥30s；`npx -y tiny-engineer doctor` |

### 5.5 舵机安全范围（装好后必须尊重）
| # | 关节 | 动作 | 安全范围（默认） |
| --- | --- | --- | --- |
| 0 | 头 | 俯仰 | 60–130° |
| 1 | 颈 | 左右 | 40–130° |
| 2 | 左手 | 抬/落 | 45–135° |
| 3 | 右手 | 抬/落（反向刻度） | 35–125° |
| 4 | 躯干 | 左右 | 40–130° |

- 这是**安装后的机械安全范围**（默认值，向导里可改并存入 NVS）。**不要盲打 0–180°**——会堵转、崩齿、拉崩 5V。
- 找限位：setup AP 模式下 `/setup/servo` 可用 0–180° 电气全范围；调好后只用安全范围。
- 空闲 2 秒后固件会**释放 PWM**，舵机变软（头可能下垂）——这是设计行为，不是故障。
- 左右手刻度相反：左手角度大=抬起，右手角度大=落下（打字姿势：左 max、右 min）。

---

## 6. 验收清单

- [ ] `GET /health` 返回 OK，OLED 显示 IP
- [ ] `POST /anim?name=ring`：摇铃 + 有声音
- [ ] 五个关节在安全范围内动作顺畅、无异响
- [ ] 装壳后无夹线、底盖平齐、六颗螺丝到位
- [ ] 断电重启自动连 Wi-Fi（无需重新配网）
- [ ] `npx -y tiny-engineer setup` hook 能触发动作（可选）

---

## 7. 官方原文索引

| 内容 | 文件 |
| --- | --- |
| 装配 20 节（英文原文 + 全部照片） | `docs/3d/assembly.md` + `docs/3d/assembly_visuals/` |
| 模块版装配（替换 §12–13） | `docs/3d/assembly-modular.md` |
| 启动/测试/故障表 | `docs/hardware/testing.md` |
| 供电与欠压症状 | `docs/hardware/power.md` |
| 舵机 PWM/释放/限速 | `docs/hardware/servos.md` |
| 关节轴与安全范围 | `docs/robot-movement.md` |
| 总流程检查表 | `docs/getting-started.md` |
| API | `docs/api.md` |
