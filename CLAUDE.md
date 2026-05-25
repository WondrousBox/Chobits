## shadcn 组件使用规范

- Button组件内图标不设置 w-、 h-、mr-、ml- 这几类样式，Button会自动处理
- 我说把Button中的文本去掉保留单个图标时，就把这个文本改成tooltip展示方式
- 原本sizes="sm"的按钮如果改成只有图标，那Button的className要加 w-8 h-8
