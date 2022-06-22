/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
/**
 * vue 中的两个核心，一个是 watcher，一个是 dep。
 * watcher.deps 表示这个 watcher 订阅了哪些依赖。dep.subs 表示这个 dep 被哪些 watcher 订阅。
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function, // 可以进行依赖收集的那个函数，如果是 computed，那么就是那个计算函数，下面的 cb 就是 null，如果是一 watch，那么这里是一个字符串，表示要观察的数据，这个会被包一层形成一个函数，下面的 cb 就是 watch 的依赖发生改变后执行的函数
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    // renderWatcher 需要手动传递这个歌标志位
    if (isRenderWatcher) {
      // 赋值
      // vm._watcher 是渲染 watcher
      vm._watcher = this
    }
    // 向当前组件的 _watchers 中天加一个 watcher
    // vm._watchers 中既有渲染 watcher，又有 computed watcher
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      // vm.$watch 注册的是一个 user watcher, computed 不是
      this.user = !!options.user
      // computed watcher 会传递 lazy 为 true
      this.lazy = !!options.lazy
      this.sync = !!options.sync
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    // expOrFn 就是组件的更新 updateComponent 函数，把它挂载到 watcher.getter 上，或者 computed 中的计算函数
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 对于 watch 来说，expOrFn 是一个 key，表示 watch 哪个 key, 之列的 parsePath 会返回一个函数，用作 getter，回去读取 vm 上的这个 key
      // 并且会触发依赖收集
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 调用 getter，进入挂载或更新流程
    // 对于 computed watcher，lazy 为 true，不会立马求值
    // 对于 watch，会直接执行 get
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // 这个逻辑很重要
    // 设置当前的 watcher，可能是一个渲染 watcher，也可能是一个 computed watcher
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 在组件的 render 过程中便会触发依赖收集
      // computed watcher 中的 getter 是 computed 的计算函数，调用计算函数，计算 computed property 的值，并且在 getter 执行过程中，如果 computed 里面依赖了其他响应式属性
      //  那么其他响应式属性也会进行依赖收集，它们的 dep.subs 里面会将 computed watcher Push 进去，表示这个 computed watcher 订阅了响应式属性，当响应式属性派发更新时，
      // 便会重新执行 computed watcher 内部存储的 computed 计算函数
      // 对于 watch，这个 getter 是前面通过 parsePath 包装过的，会去读取 vm 上的某个 key，从而出发 key 依赖收集，收集当前的 watcher。这里的 getter 返回 watch 的那个 key，在 vm 上的值
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 如果加了 deep，并且 value 是一个对象，那么深度遍历这个对象，访问其每一个 key，由于这个对象是一个响应式的，所以会触发这些属性进行依赖收集
      // 收集当前的 watch watcher 作为订阅者，这样当 watch 的这个 key 对象的深层的属性发生改变时，也会派发更新到 watch watcher
      if (this.deep) {
        traverse(value)
      }
      // 这个逻辑也很重要
      popTarget()
      // 执行清理工作，这个逻辑也很重要
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 调用 dep 的 addSub，将当前 watcher 保存到 dep.sub 上，表示这个dep 有哪些 watcher 订阅了它
  addDep (dep: Dep) {
    // 每个 dep 都会有一个 id
    const id = dep.id
    // 由于数据更新时，会再次执行 render，所以会重复触发依赖收集，这里是为了防止重复收集
    // 每次渲染都会把渲染过程收集到的依赖 push 到 new 开头的 map 中，只记录单次渲染的依赖
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // dep 也是记录所有的依赖，但不同于 newDepIds、newDeps， 后者只是辅助作用，用于更新 dep
      // 因为 vue 在渲染过程中，会存在条件渲染，每次的渲染可能收集到的依赖会有一些差别，所以需要将老的 dep 中存在，但在 new dep 中不存在的 dep 给 移除掉
      // 主要是条件渲染中 false 路径下的依赖被收集到，比如 message 这个属性由于条件渲染，并没有展示出来，所以它的依赖也不应该被收集，如果第一次渲染了 message 并且收集了它作为依赖
      // 下一次如果没有渲染 message，那么就应该把 dep 中 message 的依赖移除掉

      // 防止在 deps.subs 中重复添加相同的 watcher, 当前 watcher 如果已经订阅过该 dep 了，那么就不用再往 dep.subs 中 push 当前 watcher 了，因为里面已经存在了
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // 防止给当前 watcher 添加多余的 dep，对于本次依赖收集不涉及到的 dep，需要从 this.deps 中移除该 dep，以及清楚 dep.subs 中存储的该 watcher
  cleanupDeps () {
    // this.deps 是上次依赖收集的结果, this.newDeps 是本次 this.getter 执行后的依赖收集结果
    let i = this.deps.length
    // 遍历上次的依赖收集结果
    while (i--) {
      const dep = this.deps[i]
      // 如果本次依赖收集的结果中没有上次的某个 dep，那么 dep 需要移除对该 watcher，表示该 watcher 不再定于该未被收集到的 dep
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    // 重置，方便下次当前 watcher getter 执行时进行依赖收集
    this.newDepIds.clear()
    tmp = this.deps
    // 更新本次的依赖收集结果到 this.deps 上
    this.deps = this.newDeps
    this.newDeps = tmp
    // 重置
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 派发更新，watcher 订阅的 dep 发生改变后，会调用 watcher 的 update 方法
  update () {
    /* istanbul ignore else */
    // 对于 computed watcher，不会将 watcher push 到带调度队列中，而是将 dirty 标志位放开，这样在 render 的时候又可以触发 computed 的重新计算
    // 因为 computed 计算函数的依赖不仅收集了当前 computed watcher，还会收集 render watcher，当 computed 计算函数的依赖发生改变时，会先执行 computed watcher 的 update 方法
    // 然后将这里的 dirty 标志位放开，并不会里面做重新计算，computed watcher 执行完成后，就会执行 render watcher，rende watcher 如果访问到 computed 属性，那么就会触发 computed 
    // 属性的 getter，然后由于 dirty 为 true，便会触发 watcher.evaluate() 进行计算

    // 目前的实现方案针对 computed，只要 computed 的依赖发生改变，就会触发订阅其数据变更的 watcher 执行 update，最终重新渲染，首先执行的当前的 comoputed watcher，这里只
    // 放开了标志位，没有任何处理，所以接下来便会执行渲染 watcher，并重新渲染。不过这个问题在更高版本中被修复了，修复方案是每次派发更新执行 computed watcher 时
    // 不会像下面这样只放开标志位，而是重新计算其值，然后作对比
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      // 将当前需要更新到 watcher 更新到调度队列中
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  // 当派发更新时，调度器会调用每个 watcher 的 run 方法
  run () {
    if (this.active) {
      // 还是先调用 get，如果是渲染 watcher，那么就 update，如果是 user watcher 就返回 watcher 观察的值的最新值
      const value = this.get()
      if (
        value !== this.value ||
        // 注意下面的注释
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        // 如果是 user watcher，那么需要调用其注册回调
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    // 执行 computed 计算函数，computed 计算函数内部依赖了其他响应式属性，便会触发依赖收集
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
