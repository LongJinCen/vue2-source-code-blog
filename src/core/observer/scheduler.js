/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

// 调度 watcher 的队列
const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

/**
 * Flush both queues and run the watchers.
 */
// 刷新调度队列，run 每个 watcher
function flushSchedulerQueue () {
  // 进入刷新状态
  flushing = true
  let watcher, id
  // 注意下面这三点
  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  queue.sort((a, b) => a.id - b.id)
  // 注意下面的注释，意思是在我们处于 flushing 状态时，仍然是有可能有新的 watcher 被添加进来的
  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    id = watcher.id
    // 将该 watcher 从 has id 中去掉，表示在本次 fulshing 过程中，如果有有其他依赖派发更新时
    // 该 watcher 是可以再次被 Push 到 fulshing 中的 queue 中的
    has[id] = null
    // 执行该 watcher，如果是组件的渲染 watcher，那么就是更新视图，如果是 user 手动添加的 watch
    // 则执行 watch 中的回调
    watcher.run()
    // in dev build, check and stop circular updates.
    // 监测死循环更新，has[id] 不为 null，表示在执行 watcher 过程中又添加了该 watcher
    // 会导致无限循环
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      // 当循环的次数打到 MAX_UPDATE_COUNT 指定的次数时，便会挑出循环，停止执行 watcher，防止浏览器卡死
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()
  // 当这一批队列被统一执行完成后，需要重置调度相关状态，方便开启下一次调度
  resetSchedulerState()

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue)
  // 如果是组件的渲染 watcher 的话，调用 upadte 钩子
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  // 从子组件开始 call update 钩子
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
// 将需要更新的 watcher Push 到队列中
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  // 不能重复添加，除非队列被清空
  if (has[id] == null) {
    has[id] = true
    // 如果连续修改好几个响应式属性，那么每个响应式属性，都会派发更新，并且都会将订阅其更新的 watcher 通过调用 queueWatcher 更新到队列中
    // 如果调度队列未处于刷新状态，那么可以往渲染队列里面 Push watcher
    // 如果处于刷新状态，那么走下面的 else
    if (!flushing) {
      queue.push(watcher)
    } else {
      // 注意下面的注释
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    // 如果连续修改好几个响应式属性，那么每个响应式属性，都会派发更新，并且都会将订阅其更新的 watcher 通过调用 queueWatcher 更新到队列中
    // 为了缓存多个 watcher，一次性清空渲染队列，这里用了 nextTick 异步的去调用 flushSchedulerQueue
    // 为了防止重复调用 nextTick 和 flushSchedulerQueue，用 waiting 这个标志位来控制
    if (!waiting) {
      waiting = true
      nextTick(flushSchedulerQueue)
    }
  }
}
