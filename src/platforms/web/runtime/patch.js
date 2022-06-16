/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)

// nodeOps 是 platforms 为 web 时，浏览器相关的操作元素节点相关的方法
// modules 是一些浏览器端的一些工具方法的集合，例如 添加事件、更新属性、更新 style、创建动画等
export const patch: Function = createPatchFunction({ nodeOps, modules })
