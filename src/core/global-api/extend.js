/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  // 每个组件都会有一个 cid
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    const Super = this
    const SuperId = Super.cid
    // 这样每个组件上都会有一个 _Ctor 属性
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    // 针对同一个组件，如果它们的父构造器相同，通过 Vue.extend 多次，会返回同一个 Sub constructor，防止重复执行
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      // 校验组件的名称是否合理
      validateComponentName(name)
    }
    // 新的构造函数
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // 继承 Vue 原型上挂载的所有方法
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    // 新的构造函数，也就是这个组件的构造函数，跟 Vue 构造函数具备一样的能力，需要给它指定一个 cid
    Sub.cid = cid++
    // 会把组件的配置传入 Sub.options 上面
    // 子组件的的构造函数上的 options 包含父构造器中的 options 和该组件实例化时传递的options，
    // Super 通常是 Vue，Vue.options 上包含内置的 component、指令、filter 等，这样每个组件都能用
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    // super 指向父构造函数，当然继承后，Sub 也是一个可用的构造函数
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    if (Sub.options.props) {
      initProps(Sub)
    }
    // 在创建构造函数时，就 init 了 computed，防止重复创建 watcher，可以看上面的注释
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // Vue 实例上的一些静态方法
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    // 继承一些资产，component、directive、filter
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    // 把自己注册到自己的 components 中，允许自己引用自己
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    // 父构造器的 options 属性
    Sub.superOptions = Super.options
    // extendOptions 是 vue.extend(extendtions) 传入的 options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // 缓存 constructor
    cachedCtors[SuperId] = Sub
    // 需要注意的是，新的构造函数上面的静态属性也就是 Sub.xxx 在实例上并没有的，只能通过 Sub.xxx 进行访问
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
