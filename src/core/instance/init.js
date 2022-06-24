/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    // 每个组件都会有一个 uid，因为每个组件实例化的时候都会执行 _init 方法
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // 把 new Vue 中我们写的东西，全部都挂载到 $options 上去了，原型上任何方法都可通过 this.$options 访问到我们传递的配置
      // $options 中包含了我们 new Vue(options) 中的 options、Vue.options 上的一些东西
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    // vim._renderProxy = vim，在开发环境下访问 _renderProxy 上面的属性时，会 check 是否存在，不存在的话会输出警告
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    // 初始化一些变量，挂载了很多 $ 开头的变量到实例 vm 上，如果是组件，还会建立父子组件之间的关系
    initLifecycle(vm)
    // 处理传给当前实例的事件
    initEvents(vm)
    // 挂载了一些跟 render 会用到的一些属性跟方法到实例 vm 上
    initRender(vm)
    // 按顺序调用 vm 实例上所有注册的 beforeCreate 钩子
    callHook(vm, 'beforeCreate')
    // 不断通过 $parent 属性忘上找父实例，直到知道一个提供了 provide 属性的 vm 实例。然后再根据 provide 和 inject 插入数据
    // 所以 inject 是在 initState 之前调用，无法访问 data、props 等，而 provide 可以
    initInjections(vm) // resolve injections before data/props
    // 初始化 data、props、methods、computed、watch
    initState(vm)
    // 调用实例上注册的 provide 方法，并挂载到 vm._provide 上
    initProvide(vm) // resolve provide after data/props
    // create 还没创建 vnode，还没进行 mount
    callHook(vm, 'created')

    // 性能打点，结束测量，得到 init 阶段的耗时
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }
    // 最后挂载到页面上，进入到 mount 阶段
    // 如果当前 init 的是一个组件，那么 el 是空的
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 在创建组件的 构造函数时，会把父构造函数上的 options 跟 h(component, options, childrens) 中的 options 合并
  // 挂载到 constructor.options 上
  // 将构造器上的 options 挂载到当前实例上，Object.create 将 vm.constructor 挂载到原型上
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  // 当前组件的 _parentVnode 是组件的占位符 Vnode
  const parentVnode = options._parentVnode

  // 更新 vm.$options 上的一些属性
  // 当前组件的 parent 是指父组件的实例 vm
  opts.parent = options.parent // 父组件的实例
  opts._parentVnode = parentVnode // 组件的占位符 Vnode
  opts._parentElm = options._parentElm // 父 dom 节点
  opts._refElm = options._refElm

  // 占位符 Vnode 上的 componentOptions，是在为组件创建占位符 Vnode 时添加的，包含了 { Ctor // 当前组件的构造函数, propsData // 传给当前组件的 props 数据, listeners // 事件, tag // 组件的字符串 tag <hello />  就是 "hello", children // 孩子节点 } 信息
  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  // 对于组件来说，它的 render Children 通常用作默认插槽，具名插槽会被编译到 data vnode.data 属性中，不会被当做 children
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  // 对于组件来说，组件的 render 是存储在当前构造函数的 options 上,
  // 即 vnodeComponentOptions.Ctor.options.render、vm.constructor.options
  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const extended = Ctor.extendOptions
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = dedupe(latest[key], extended[key], sealed[key])
    }
  }
  return modified
}

function dedupe (latest, extended, sealed) {
  // compare latest and sealed to ensure lifecycle hooks won't be duplicated
  // between merges
  if (Array.isArray(latest)) {
    const res = []
    sealed = Array.isArray(sealed) ? sealed : [sealed]
    extended = Array.isArray(extended) ? extended : [extended]
    for (let i = 0; i < latest.length; i++) {
      // push original options and not sealed options to exclude duplicated options
      if (extended.indexOf(latest[i]) >= 0 || sealed.indexOf(latest[i]) < 0) {
        res.push(latest[i])
      }
    }
    return res
  } else {
    return latest
  }
}
