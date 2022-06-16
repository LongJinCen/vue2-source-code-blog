/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
// https://github.com/snabbdom/snabbdom
// snabbdom 的一些钩子
const componentVNodeHooks = {
  // 实例化组件时，会第一个调用该函数
  init (
    vnode: VNodeWithData,
    hydrating: boolean,
    parentElm: ?Node,
    refElm: ?Node
  ): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // 创建组件的实例，跟 new Vue(options) 似的。
      // 这里的 activeInstance 很重要，组件的通常流程是 init => mount => update => render => patch
      // 当调用 Update 时，会将当前正在 upate 的实例赋值给 activeInstance，当创建 child 组件的实例时，就能将 activeInstance
      // 设置为 child 组件实例的 parent 实例
      // 组件的实例会挂载到占位符 vnode.componentInstance 上
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance,
        parentElm,
        refElm
      )
      // 创建组件实例后，进行 mount，又进入到 mount 的流程，child 实例的父 vnode 是一个占位符 vnode，所以它的 elm 是空的
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },
  // A 组件中引用了 B、C、E 组件，该钩子会在 A 组件 patch 完成后（B、C、E 也 patch 完成），统一调用 B、C、E 的该 insert 钩子
  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      // 当前组件挂载完成
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string // 组件的字符串名称
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  // 拿到 constructor，这里是指 Vue，会在 initGlobal 的时候注入值
  // context 表示也就是 vim，表示用于创建当前 vim 的 _base constructor 创建新组件的实例
  // _base 在全局只有一个，都是指 Vue 这个 constructor，每个组件都是继承它来的
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  // 没有继承之前，组件 Ctor 只是一个对象，还没有 Vue 构造函数上的一些方法和属性，继承之后会把 Vue 的一些静态属性，和全部的 prototype 都继承
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
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
  let asyncFactory
  // 可以看到异步组件都是一个函数，函数不会进到前面的 extend 逻辑，所以不会有 cid
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor, context)
    // 异步加载时 Ctor 如果是 undefined，那么说明没有 loading 态， fallback 处理为为该组件创建一个注释节点
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 更新 Ctor.options 的引用关系
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props
  // 根据 h 函数传入的 data，提取其中的 props、attr，并根据当前新建的组件的 Ctor 的 options 中定义的接收的 props,
  // 得到的 propsData 即接收的 props 对应的外层传进来的具体数据
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 为当前 vNode 注册一些钩子，挂载在 data.hook 上，在组件的不同阶段会调用
  installComponentHooks(data)

  // return a placeholder vnode
  const name = Ctor.options.name || tag
  // 实例化组件的 VNode，这个是在当前实例中为该组件创建一个占位符 VNode，也就是在用这个组件的地方是一个占位符 VNode
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    // 跟普通节点不同，这里还会传入一些额外的信息，例如 children，这里统一挂载到 vnode.componentOptions 上
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }
  return vnode
}

export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
  parentElm?: ?Node,
  refElm?: ?Node
): Component {
  // 这里的 options 是传递给组件的构造函数的，可以理解为 new Vue(options) 中的 options
  const options: InternalComponentOptions = {
    _isComponent: true,
    parent, // 组件实例
    _parentVnode: vnode, // 占位符 vnode，因为占位符 vnode 里面的 componentOptions 包含了一些组件的数据，后面还需要再用到
    _parentElm: parentElm || null, // 父 dom 节点
    _refElm: refElm || null
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // 利用创建 vnode 阶段为该组件生成的构造函数，实例化组件，执行组件的 _init 方法，并且因为没有指定 el，不会执行 $mount 函数
  return new vnode.componentOptions.Ctor(options)
}

function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    hooks[key] = componentVNodeHooks[key]
  }
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  ;(data.props || (data.props = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  if (isDef(on[event])) {
    on[event] = [data.model.callback].concat(on[event])
  } else {
    on[event] = data.model.callback
  }
}
