# 自己编译固件（含 `POST /play`）

`POST /play` 从来没进过正式 release：它由 `ec87ad7`（PR #57）引入，而 v0.2.0 之后上游没有发新 tag。所以想要"让机器人念任意一段音频"，只能从 `main` 编译。仓库里已经放了一份本机编译好的产物：`main-261adc2/`。

## 产物

| 文件 | 刷到 | 用途 |
|---|---|---|
| `firmware.bin` | `0x10000` | 应用（USB 刷机 / OTA） |
| `bootloader.bin` | `0x0` | 引导 |
| `partitions.bin` | `0x8000` | 分区表（`nvs` 在 `0x9000/0x5000`） |
| `littlefs.bin` | `0x220000` | 文件系统：内置 `bell/welcome/attention/error/abort/dead.wav` |
| `firmware.factory.bin` | `0x0` | 合并镜像，给网页刷机工具用 |

版本串：`v0.2.0-28-g261adc2`，应用占用 63.8%，RAM 16.6%。

## 复现（Windows / git-bash）

前置：PlatformIO Core **≥ 6.2.0**、Node **≥ 22.12**（构建 Web UI）、能访问 GitHub 与 npm（本项目用了代理 `127.0.0.1:7897`）。

```bash
cd tiny-engineer
git fetch origin && git merge --ff-only origin/main
export HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897
export npm_config_proxy=$HTTPS_PROXY npm_config_https_proxy=$HTTPS_PROXY
export PLATFORMIO_CORE_DIR=C:/pio          # 见坑 2
cmd.exe /c C:\\pio\\build.bat              # 见坑 3；等价于 pio run
cmd.exe /c C:\\pio\\build.bat -t buildfs   # 需要 littlefs.bin 时
```

## 三个 Windows 坑（都踩过了）

1. **PlatformIO Core 太旧**
   `esp-idf` 平台要求 Core ≥ 6.2.0，机器上是 6.1.15，报
   `IncompatiblePlatform: … depends on PlatformIO Core >=6.2.0`。
   修：`~/.platformio/penv/Scripts/python.exe -m pip install -U platformio`（升到 6.2.0）。

2. **MAX_PATH 260**
   解压 `esp32-core-3.3.12-libs` 时路径正好 260 字符，报 `FileNotFoundError … CameraAvSettingsUserLevelManagementCluster.h`。
   修：把 PlatformIO 的家目录挪到短路径 `PLATFORMIO_CORE_DIR=C:\pio`（省掉 18 个字符）。

3. **`idf_tools.py` 拒绝 MSYS**
   git-bash 会给所有子进程注入 `MSYSTEM`，而 `idf_tools.py` 见到它就 `ERROR: MSys/Mingw is not supported`，于是工具链/esptool 装不上，编译时报 `'riscv32-esp-elf-g++' is not recognized`。
   `env -u MSYSTEM` **无效**（MSYS 运行时会给原生子进程重新注入）。修：用 cmd 驱动，并在批处理里 `set "MSYSTEM="` 再调 `pio.exe` —— 见 `C:\pio\build.bat`。

## 刷机

```bash
# USB：会先尝试 tiny-engineer park --transport serial 把舵机放中间，再烧 app
pio run -t upload          # post 脚本会顺带上传文件系统
# 只想烧 app、沿用现有文件系统：
pio run -t upload -t nobuildfs   # 或在 upload 前删掉 .pio/build/*/littlefs.bin
```

- **标定不会丢**：`nvs` 在两张分区表里都是 `0x9000/0x5000`，别用 `-t erase`。
- **`-e ota` 会挪 LittleFS**（`0x220000` → `0x310000`），必须跟着刷文件系统。
- 刷完自检：

```bash
curl -s --noproxy '*' http://<ip>/ | grep -o /play
curl -s --noproxy '*' -o /dev/null -w '%{http_code}\n' -X POST http://<ip>/play   # 不再是 404
tiny-engineer play clip.wav     # 16-bit mono 22050 Hz
```

## 这个版本相对 v0.2.0 的新东西

`POST /play`、`PUT /settings/wifi`（最多 5 个网络，旧的单网络配置会自动迁移）、`POST /servos/park`、引导式舵机标定、USB 串口控制模式、Preact 重写的 Web UI、带访问级别的路由表。
