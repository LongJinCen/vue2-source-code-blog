/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 拿到原本的 $mount
const mount = Vue.prototype.$mount
// 由于这里是带 compiler 版本的 vue，所以 mount 需要检查是否有 template 传入，如果没有被编译，那么需要先编译
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)

  /* el 不能是 body 或者 document，如果是，那么直接停止挂载流程 */
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // 没有 render 函数，那么就进行编译
  if (!options.render) {
    let template = options.template
    // 处理 template 的各种写法
    if (template) {
      if (typeof template === 'string') {
        // 如果传递的是一个 id 选择器，那么 template 为查询 id 对应的节点的 innerhtml
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      // 如果 template 传递的直接是一个原生的 dom 节点
      } else if (template.nodeType) {
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    // 如果没有传递 template，那么直接把 el 对应的 html 当做 template
    } else if (el) {
      template = getOuterHTML(el)
    }
    if (template) {
      // 性能打点，编译模板耗时开始
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }
      // 进行编译，将 template string 编译为 render function
      const { render, staticRenderFns } = compileToFunctions(template, {
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      // 最后把编译后的两个 render 挂载到 vim.$options 上
      options.render = render
      options.staticRenderFns = staticRenderFns

      // 性能打点，编译模板耗时结束
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 进行真正的挂载流程 ./runtime/index.js
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
