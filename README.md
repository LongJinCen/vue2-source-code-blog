# vue2-source-code-blog

![双城之战](./wallhaven-8o8gpo.jpeg)

不包含 weex、ssr 的处理逻辑，仅包含 web 端相关逻辑。

对于 compiler 可以直接在 [sfc playground](https://sfc.vuejs.org/#eyJBcHAudnVlIjoiPHNjcmlwdCBzZXR1cD5cbmltcG9ydCB7IHJlZiB9IGZyb20gJ3Z1ZSdcblxuY29uc3QgbXNnID0gcmVmKCdIZWxsbyBXb3JsZCEnKVxuPC9zY3JpcHQ+XG5cbjx0ZW1wbGF0ZT5cbiAgPGgxPnt7IG1zZyB9fTwvaDE+XG4gIDxpbnB1dCB2LW1vZGVsPVwibXNnXCI+XG48L3RlbXBsYXRlPiIsImltcG9ydC1tYXAuanNvbiI6IntcbiAgXCJpbXBvcnRzXCI6IHtcbiAgICBcInZ1ZVwiOiBcImh0dHBzOi8vc2ZjLnZ1ZWpzLm9yZy92dWUucnVudGltZS5lc20tYnJvd3Nlci5qc1wiXG4gIH1cbn0ifQ==) 中查看编译后的代码，主要是 ast 那一套，无需太关注。

从入口 `src/platforms/web/entry-runtime-with-compiler.js` 开始查看即可。具体包含哪些部分的注释，可以看 [commits](https://github.com/LongJinCen/vue2-source-code-blog/commits/main)