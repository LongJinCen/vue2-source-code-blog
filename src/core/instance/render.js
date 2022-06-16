/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

export function initRender (vm: Component) {
  // 当前实例的 vnode
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  // vm.$vnode 是组件的一个占位符 vnode
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree
  // 父 Vnode 所在的 Vue 实例
  const renderContext = parentVnode && parentVnode.context
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  // 这个是内部使用的 createElement
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  // 这个是传给 render 函数的 createElement
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  // parentVnode.data 包含传给当前实例的所有 data，而 parentData.componentOptions.propsData 只包含组件接受的 props 的 data
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    // 定义 $attrs 和 $listeners
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    const { render, _parentVnode } = vm.$options

    // reset _rendered flag on slots for duplicate slot check
    if (process.env.NODE_ENV !== 'production') {
      for (const key in vm.$slots) {
        // $flow-disable-line
        vm.$slots[key]._rendered = false
      }
    }

    if (_parentVnode) {
      vm.$scopedSlots = _parentVnode.data.scopedSlots || emptyObject
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    // 如果是组件，这里的 _parentVnode 是一个占位符 vnode，所以实例上的 $vnode 表示组件的父占位符 vnode，能够访问到占位符 vnode 上的一些数据
    vm.$vnode = _parentVnode
    // render self
    let vnode
    try {
      /**
       * 1. 调用 vm 实例上的 render 函数，并且把 render 函数的 this 绑定到 _renderProxy 上，
       *  也就是 vm 上，这样在 render 函数中就能通过 this 访问到 data 中的数据
       * 2. 如果在 createElement 的过程中发现 tag 不是一个 html 普通标签，而是一个组件，那么会调用 createComponet 创建组件的实例，
       *  并且为该组价创建一个 $vnode，表示一个组件占位符 vnode
       * 3. 因为组件是一个占位符 vnode，所以渲染当前组件的时候，调用 render 时，不会创建子组件真实的渲染 vnode，而是要等到当前组件渲染到该占位符 vnode
       *  时，才会调用子组件的 render 为子组件创建渲染 vnode
       */
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      // render 函数执行出错，调用组件或者全局注册的错误处理相关的函数
      handleError(e, vm, `render`)
      if (process.env.NODE_ENV !== 'production') {
        // 如果传递的 renderError 函数，那么会把 renderError 返回的 Vnode 当做这一次的渲染结果
        if (vm.$options.renderError) {
          try {
            vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
          } catch (e) {
            handleError(e, vm, `renderError`)
            vnode = vm._vnode
          }
        } else {
        // 如果渲染出错，那么本次渲染的结果沿用上一次的渲染结果，防止白屏
          vnode = vm._vnode
        }
      // 如果渲染出错，那么本次渲染的结果沿用上一次的渲染结果，防止白屏
      } else {
        vnode = vm._vnode
      }
    }
    // return empty vnode in case the render function errored out
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }
    // set parent
    // 设置当前 vnode 的 parent vnode，如果是组件，那么 _parentVnode 是一个占位符 vnode
    vnode.parent = _parentVnode
    return vnode
  }
}
