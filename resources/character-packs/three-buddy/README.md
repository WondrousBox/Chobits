# Three Buddy

Three Buddy 是用于验证 Chobits `three` 展示模式的项目自有 VRM 1.0 示例角色包。

- `models/three-buddy.vrm` 由 `scripts/generate-three-buddy-vrm.mjs` 生成。
- `motions/*.vrma` 由 `scripts/generate-three-buddy-vrma.mjs` 生成，包含 idle、walk、welcome 和 thinking。
- 模型只使用脚本定义的基础几何和材质，不包含外部纹理或第三方模型资源。
- 模型与角色包按仓库 MIT 许可证分发。
- 模型包含标准 expression 和 LookAt 定义，可验证眨眼、表情、注视与口型。

重新生成模型：

```bash
node scripts/generate-three-buddy-vrm.mjs
node scripts/generate-three-buddy-vrma.mjs
```
