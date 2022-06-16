/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'

function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

/**
 * 处理异步组件
 * 1. () => import("xxx.vue")
 * 2. (resolve, reject) => { require(['./my-async-component'], resolve) }
 * 3. const AsyncComponent = () => ({
      component: import('./MyComponent.vue'),
      loading: LoadingComponent,
      error: ErrorComponent,
      // Delay before showing the loading component. Default: 200ms.
      delay: 200,
      // The error component will be displayed if a timeout is
      // provided and exceeded. Default: Infinity.
      timeout: 3000
    })
  */
export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>,
  context: Component
): Class<Component> | void {
  // factory.error|resolved|loading|loadingComp|contexts第一次进来的时候都是 undefined，forceupdate 之后，二次渲染时进来会有值

  // 如果加载结果出错，那么返回 error component
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }
  // 如果成功加载，那么返回 resolved 的结果
  if (isDef(factory.resolved)) {
    return factory.resolved
  }
  // 如果当前还在 Loading，那么返回 Loading component
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  // 表示使用当前异步组件的地方，也就是有哪些组件使用了这个异步组件
  if (isDef(factory.contexts)) {
    // already pending
    factory.contexts.push(context)
  // 下面的逻辑只会执行一次，加载完成后统一调用 context 的 $foreupdate，如果有多个 context，就调用多个 context $forceupdate
  } else {
    const contexts = factory.contexts = [context]
    let sync = true
    // 组件加载完成后会调用该函数进行 $forceUpdate，引用了该异步组件的地方都会重新渲染，重新渲染的时候
    // 又会走到该 resolve-async-component.js 中，由于 forceupdate 时 组件已经加载完成了，所以就能拿到 resolve 后的组件
    const forceRender = () => {
      for (let i = 0, l = contexts.length; i < l; i++) {
        contexts[i].$forceUpdate()
      }
    }
    // once 的作用是保证 resolve 函数只执行一次
    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      // 对于拿到的组件，为其创建一个构造函数，并挂载到 factory.resolved 上
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      // 组件加载完毕后，直接 forceupdate
      if (!sync) {
        forceRender()
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      // 加载失败后，将 factory.error 设置为 true，并强行 forceupdate
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender()
      }
    })

    // 执行异步组件的加载函数
    const res = factory(resolve, reject)
    // 第二种写法 res 为一个 undfined
    // 第一和第三种返回都是一个对象
    if (isObject(res)) {
      // 第一种写法，返回的是一个 Promise
      if (typeof res.then === 'function') {
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      // 第三种写法
      } else if (isDef(res.component) && typeof res.component.then === 'function') {
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          // 如果定义了处理 error 状态下的 component，那么为该组件创建一个构造函数
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          // 如果定义了处理 loading 状态下的 component，那么为该组件创建一个构造函数
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          // 立马进入 loading 状态
          if (res.delay === 0) {
            factory.loading = true
          } else {
            // 过指定时间之后才进入 loading 状态
            setTimeout(() => {
              // 如果过了指定时间组件仍未加载完毕，那么进入 loading 状态，并 forceupdate 一次，展示其 loading component
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender()
              }
            }, res.delay || 200)
          }
        }
        // 过了 timeout 时间之后，仍然未加载完毕，那么 reject，展示组件的 error 态
        if (isDef(res.timeout)) {
          setTimeout(() => {
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously
    // 如果立马进入 loading 态，直接返回 loading component 用于首次渲染，否则返回 factory.resolved，因为此时组件还未加载完毕，所以 factory.resolved 为 undefined
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
