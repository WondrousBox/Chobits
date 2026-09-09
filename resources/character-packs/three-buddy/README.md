# Three Buddy

Three Buddy 是用于验证 Chobits `three` 展示模式的项目自有 VRM 1.0 示例角色包。

- `models/three-buddy.vrm` 由 `scripts/generate-three-buddy-vrm.mjs` 生成。
- 模型只使用脚本定义的基础几何和材质，不包含外部纹理或第三方模型资源。
- 模型与角色包按仓库 MIT 许可证分发。
- 当前动画索引只声明 rest-pose idle；接入 VRMA 后再增加动作文件和对应 trigger。

重新生成模型：

```bash
node scripts/generate-three-buddy-vrm.mjs
```
