/* @flow */
/* globals MessageChannel */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIOS, isNative } from './env'

// 需要执行的 callback 集合，每次 tick 都会清空 callbacks
const callbacks = []
let pending = false

// 执行队列中的函数，并且清空
function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
let microTimerFunc
let macroTimerFunc
// 默认使用微任务，某些情况下使用宏任务，具体看上面的注释
let useMacroTask = false

// Determine (macro) task defer implementation.
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
/* istanbul ignore if */
// 只有 ie 支持 setImmediate
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  macroTimerFunc = () => {
    setImmediate(flushCallbacks)
  }
// 使用 messageChannel
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks
  macroTimerFunc = () => {
    port.postMessage(1)
  }
// 如果没有 messageChangnel 就使用 setTimeout
} else {
  /* istanbul ignore next */
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// Determine microtask defer implementation.
/* istanbul ignore next, $flow-disable-line */
// 默认使用 promise
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  microTimerFunc = () => {
    p.then(flushCallbacks)
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
// 如果没有 promise，则 fallback 到宏任务
} else {
  // fallback to macro
  microTimerFunc = macroTimerFunc
}

// 注意下面的注释
/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a (macro) task instead of a microtask.
 */
export function withMacroTask (fn: Function): Function {
  return fn._withTask || (fn._withTask = function () {
    useMacroTask = true
    const res = fn.apply(null, arguments)
    useMacroTask = false
    return res
  })
}

export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 通过 nextTick 注册的回调，包装后统一 push 到 callback 中
  callbacks.push(() => {
    // nextTick(cb) 这种方式一定是传了 cb 的
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    // nextTick().then(cb) 的方式是没有传递 cb 的，所以 nextTick 会返回一个 promise
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  // 确保下面的函数只调用一次
  // 执行 macroTimerFunc 或者 microTimerFunc 后便会注册一个微任务或者宏任务
  // 当这个注册的微任务或者宏任务执行前，再调用 nextTick，传递的回调会一直往 callbacks 中 Push
  // 当这个注册的微任务或者宏任务执行时，会拷贝一份 callbacks，然后清空 callbacks，并且 pending 置为 false
  // 然后会依次执行拷贝的那一份 callbacks，如果执行期间通过 nextTick 注册的回调虽然会被 Push 到 callbacks
  // 但是需要等到下一个 tick 才会执行
  // 注意：拿渲染 watcher 更新来说，派发更新时，会注册一个 tick，用于执行渲染 watcher，
  //    如果在触发派发更新前通过 nextTick 注册的 cb，那么可能会存在这个 cb 访问到的一些数据是旧的（一些数据需要执行完渲染 watcher 后才会拿到新的）
  if (!pending) {
    pending = true
    if (useMacroTask) {
      macroTimerFunc()
    } else {
      microTimerFunc()
    }
  }
  // $flow-disable-line
  // 如果没有传递 cb，那么这个 nextTick() 需要返回一个 Promise，这个 promise 在 前面注册的 callback 执行后会执行 _resolve，然后就会执行 nextTick().then(cb) 中的 cb
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
