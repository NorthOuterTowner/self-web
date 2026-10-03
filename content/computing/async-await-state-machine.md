---
title: 从 async/await 回到状态机
lede: await 读起来像阻塞，执行起来不是。把它展开成显式状态机之后，很多关于执行顺序的困惑会自己消失。
date: 2026-08-14
tags: [Runtime, Concurrency, JS]
---

`async` 函数的语法糖掩盖了一个事实：函数体被切成了若干段，每个 `await` 是一个切点。运行时需要在挂起时保存局部变量，在恢复时跳回正确的位置。这正是状态机的定义。

## 一次手工展开

```js
async function load(id) {
  const meta = await fetchMeta(id);
  const body = await fetchBody(meta.url);
  return { meta, body };
}
```

三个状态：进入、拿到 meta、拿到 body。局部变量 `meta` 必须跨越第二个 `await` 存活，所以它不能只放在栈上。

```js
function load(id) {
  let state = 0, meta, body;
  function step(value) {
    switch (state) {
      case 0:
        state = 1;
        return fetchMeta(id).then(step);
      case 1:
        meta = value; state = 2;
        return fetchBody(meta.url).then(step);
      case 2:
        body = value;
        return { meta, body };
    }
  }
  return Promise.resolve().then(step);
}
```

## 能解释什么

### 为什么 async 函数的同步部分会立即执行

状态 0 到第一个 `await` 之间的代码在调用时就跑完了。所以把参数校验放在第一个 `await` 之前，错误会同步抛出路径之外 —— 它变成 rejected promise，而不是立刻 throw。这是很多「`try`/`catch` 没抓到」的来源。

### 为什么顺序 await 两个独立请求会变慢

每个 `await` 都是一次真实的挂起。两个无依赖关系的请求写成顺序 `await`，等于人为串行化。展开成状态机后这点非常直观：状态 1 不会在状态 0 的 IO 完成前开始。

```js
// 串行：总耗时 = a + b
const a = await getA();
const b = await getB();

// 并行：总耗时 = max(a, b)
const [a, b] = await Promise.all([getA(), getB()]);
```

## 微任务队列的位置

`then` 的回调进入微任务队列，这意味着恢复不是同步发生的，而是在当前宏任务的同步代码全部执行完、队列被清空时才轮到。`await` 一个已经 resolve 的值同样要排队 —— 它只是排得很靠前。

> await 的成本不在于等待，而在于它强制划出了一个调度边界。

实践上有两条简单规则：不要在循环里 `await` 彼此独立的操作；需要同步失败语义的校验，放在 `async` 函数外面。
