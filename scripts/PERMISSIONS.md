# macOS 权限检查指南

## 快速检查权限

运行以下命令检查应用的权限配置：

```bash
pnpm check:permissions
```

或者直接运行：

```bash
node scripts/check-permissions.mjs
```

## 为什么无法录制电脑声音？

在 macOS 上，录制系统音频（电脑声音）需要特殊的权限配置。关键点：

### 1. 必需的权限

- **屏幕录制权限**（最重要）
  - 这是录制系统音频的关键权限
  - 在授予权限时，**必须勾选「允许系统音频录制」**

- **麦克风权限**（可选，但建议开启）
  - 用于录制麦克风输入

### 2. 如何授予权限

#### 方法 1：通过系统设置

1. 打开「系统设置」>「隐私与安全性」
2. 找到「屏幕录制」选项
3. 如果应用未列出，点击「+」按钮添加应用
4. 开启应用的开关
5. **重要**：在弹出的对话框中，**必须勾选「允许系统音频录制」**
6. 授予权限后，**必须重启应用**才能生效

#### 方法 2：快速打开设置

运行以下命令快速打开相应的设置页面：

```bash
# 打开屏幕录制设置
open 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

# 打开麦克风设置
open 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
```

### 3. 常见问题

#### Q: 为什么授予了屏幕录制权限，但还是无法录制系统音频？

**A:** 在授予屏幕录制权限时，必须勾选「允许系统音频录制」选项。如果之前没有勾选，需要：

1. 在系统设置中关闭应用的屏幕录制权限
2. 重新开启，并在弹出的对话框中勾选「允许系统音频录制」
3. 重启应用

#### Q: 应用未出现在权限列表中怎么办？

**A:**

1. 确保应用已正确安装（不是从 zip 解压直接运行）
2. 尝试重新安装应用
3. 手动添加应用：
   - 在权限设置页面点击「+」按钮
   - 导航到应用位置（通常在 `/Applications` 目录）
   - 选择并添加应用

#### Q: 如何验证权限是否生效？

**A:**

1. 在应用中尝试开始录制
2. 如果权限未授予，应用会显示提示对话框
3. 查看系统日志（需要管理员权限）：
   ```bash
   sudo log show --predicate 'subsystem == "com.apple.TCC"' --last 1h | grep -i "chobits"
   ```

## 应用配置检查

### 1. entitlements.plist

确保 `public/entitlements.plist` 包含以下权限：

```xml
<key>com.apple.security.device.audio-input</key>
<true/>
<key>com.apple.security.device.camera</key>
<true/>
<key>com.apple.security.app-sandbox</key>
<false/>
```

### 2. electron-builder.json

确保 `mac.extendInfo` 包含以下使用说明：

```json
{
  "NSMicrophoneUsageDescription": "此应用需要访问麦克风以进行音频录制",
  "NSScreenCaptureUsageDescription": "此应用需要屏幕录制权限以录制屏幕和系统音频"
}
```

## 代码签名

为了确保权限正常工作，建议对应用进行代码签名：

```bash
# 使用开发者证书签名
codesign --force --deep --sign "Developer ID Application: Your Name" /path/to/app
```

未签名的应用（adhoc 签名）可能无法正确请求权限。

## 相关资源

- [Apple 官方文档：控制对屏幕录制的访问](https://support.apple.com/zh-cn/guide/mac-help/mchld6aa7d23/mac)
- [Apple 官方文档：控制对麦克风的访问](https://support.apple.com/zh-cn/guide/mac-help/mchla1b1e1fe/mac)
