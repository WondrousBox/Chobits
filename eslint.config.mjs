import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';
import tseslint from '@electron-toolkit/eslint-config-ts';
import { defineConfig } from 'eslint/config';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/dist-electron', '**/out', '**/release', 'src/live2d-sdk'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // Disable explicit any checks across TS files
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    // shadcn/ui 上游约定:组件文件同时导出 cva 变体函数与 hook,保持与上游一致便于后续更新
    files: ['src/components/ui/**'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    plugins: {
      'simple-import-sort': simpleImportSort
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/ban-ts-comment': 'off',
      // 项目整体不要求显式返回类型(工具链默认与代码风格不符);纯 JS/MJS 文件无法书写返回类型标注,一并关闭
      '@typescript-eslint/explicit-function-return-type': 'off',
      // TS 项目由编译器保证 props 类型,无需运行时 propTypes
      'react/prop-types': 'off',
      // cmdk 组件库要求的 DOM 属性
      'react/no-unknown-property': ['error', { ignore: ['cmdk-input-wrapper'] }],
      // 与项目 `_event` 等下划线占位约定对齐;ignoreRestSiblings 允许用 rest 解构省略字段
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    }
  },
  eslintConfigPrettier
);
