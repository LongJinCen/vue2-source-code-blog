/* @flow */

import { toNumber, toString, looseEqual, looseIndexOf } from 'shared/util'
import { createTextVNode, createEmptyVNode } from 'core/vdom/vnode'
import { renderList } from './render-list'
import { renderSlot } from './render-slot'
import { resolveFilter } from './resolve-filter'
import { checkKeyCodes } from './check-keycodes'
import { bindObjectProps } from './bind-object-props'
import { renderStatic, markOnce } from './render-static'
import { bindObjectListeners } from './bind-object-listeners'
import { resolveScopedSlots } from './resolve-slots'

export function installRenderHelpers (target: any) {
  target._o = markOnce
  target._n = toNumber
  target._s = toString
  target._l = renderList
  // 对于普通插槽，是在父组件中创建 vnode，然后在子组件中渲染，对于作用域插槽，是在子组件中渲染时，将相关的数据传入
  // 渲染插槽用的，即定义 <slot></slot> 的地方，slot 被编译后，会使用 vm._t 去渲染插槽
  // 会去 vm.$scopedSlots 或者 vm.$slots 上取到在父组件渲作用域渲染好的插槽节点 vnode
  target._t = renderSlot
  target._q = looseEqual
  target._i = looseIndexOf
  target._m = renderStatic
  target._f = resolveFilter
  target._k = checkKeyCodes
  target._b = bindObjectProps
  target._v = createTextVNode
  target._e = createEmptyVNode
  // 对于作用域插槽，在编译的时候，定义定义 <slot></slot> 的放回通过 vm._t 渲染，而在外部指定作用域插槽时，
  // 被会编译成 vm._u 去创建一个函数，这个函数接受一个 prop，这个 prop 就是子组件传递进来的
  target._u = resolveScopedSlots
  target._g = bindObjectListeners
}
