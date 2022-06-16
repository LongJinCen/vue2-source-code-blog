/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    // 每个 dep 都有一个 id
    this.id = uid++
    // watcher 的集合，表示有哪些 watcher 订阅了数据的改变
    this.subs = []
  }
  // 表示当前 dep 被哪些 watcher 订阅了
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }
  // 调用 Dep.target，也就是当前正在渲染的组件对应的 watcher 上的 target 方法
  // 将当前 dep 实例，每个属性都会有一个 dep 实例，记录到 watcher 中，表示 watcher 订阅了哪些数据的更新
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }
  // 派发更新
  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    for (let i = 0, l = subs.length; i < l; i++) {
      // 调用每个 watcher 的 Update 方法进行更新
      subs[i].update()
    }
  }
}

// the current target watcher being evaluated.
// this is globally unique because there could be only one
// watcher being evaluated at any time.
// 由于组件的挂载流程是递归的，每个组件的挂载都会有一个 渲染 watcher，或者 computed watcher,因此通过 targetStack 来记录 watcher 栈
// 用 Dep.target 来记录当前的 watcher
Dep.target = null
const targetStack = []

export function pushTarget (_target: ?Watcher) {
  // 将上一个 watcher push 到栈中
  if (Dep.target) targetStack.push(Dep.target)
  // 更新当前 watcher
  Dep.target = _target
}

export function popTarget () {
  // 当当前组件 update 完成后，会回到上一个组件，所以需要弹出一个 watcher 作为当前的 watcher
  Dep.target = targetStack.pop()
}
