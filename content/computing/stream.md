---
title: 关于流式处理——根据示例进行讲解
lede: 以项目中的例子详细讲述如何对数据进行流式处理从而进行优化，以提高性能和用户体验。此处的例子是当前经常使用的 LLM 数据获取。
date: 2026-04-19
tags: [Stream, SSE, LLM, Vue]
---

在我们的项目中，我们使用 LLM 来构建一个小型的 AI bot，并加入一小部分关于我们项目的信息，使得用户可以通过这个 bot 加深对我们项目的了解。

## 准备工作

本模块在前端和后端中都需要进行设置。因此首先假设你已经对`Vue.js`和`node.js`有一定的了解，如果不够了解请先进行`Vue3`和`node.js`知识的回顾。

## 构建后端

## 了解LLM API的使用
首先完成后端API，我们需要先进行LLM API的熟悉工作，了解如何获取他的信息。
经过一定的了解后，我们这里使用了一个第三方的平台来进行AI数据的访问，首先指定url，之后构建`options json`, 在请求头中以指定格式携带自己的`API token`作为验证请求头。之后构建请求体，其中`use_model`在这里是一个变量，如果需要指定固定模型只需直接输入想要的model即可，在messages信息中需要填入自己输入的内容以及用户角色。你的输入是`user`角色的（LLM的是什么我不记得了，也许是`assistant`吧，或者是`ai`之类的，总之看他的官方文档就可以了）。
**注意:`stream`字段的值必须为`true`，这一点确保了官方API以`stream`方式进行传输，如果不保证这一点则在之后一定不可能完成流式数据的获取。**
```js
const url = "https://api.siliconflow.cn/v1/chat/completions";
const options = {
    method: "POST",
    headers: {
        Authorization: `Bearer ${SILICON_API_KEY}`,
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        model,
        messages: [{ role: "user", content: input }],
        stream: true,
        thinking_budget: 128    
    })
};
```

### 完成接口

此处定义了一个简单的名为`chat`的API，其中比较重点的是需要设置比较特别的响应头，即`res.setHeader('Content-Type', 'text/event-stream');`，专门指定流式数据。

text/event-stream 是 SSE (Server-Sent Events) 规范要求的响应头。不同于我们常见的 application/json，它有几个显著特点：

1. 长连接： 客户端发起请求后，连接会一直保持开启，直到服务端主动调用 end() 或客户端断开。

2. 文本协议： 传输的内容必须是纯文本。虽然名字叫“流”，但它其实是以特定的格式发送的一段段文本，通常以 data:  开头，以两个换行符 `\n\n` 结尾。

3. 轻量级： 相比于 `WebSocket` 的全双工通话，SSE 是单向的（服务器 -> 客户端），这在 AI 聊天这种“用户问一句，AI 回一屏”的场景下，性能开销更小，实现也更简单。

在进行请求后，需要通过`reader`和`decoder`进行流式数据的获取和解码工作，通过`reader`持续获取信息，来判断流式数据是否结束，在未结束的情况下再通过`decoder`进行二进制流的转换，持续写入返回数据，在结束的情况下，结束和前端的通信。**此处使用了`res.write()`和`res.end()`的方法进行数据返回，而不是简单的`res.send()`,这与流式传输的要求有关。**

```js
router.post("/chat", async (req, res) => {
    const { model, input } = req.body || {};
    
    /** LLM API的url和options定义 */
    /** 此处填入上个部分的内容即可 */

    const response = await fetch(url, options);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            res.end(); break;
        }
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
    }
});
```

值得注意的是，这里总是使用await的方式对数据进行fetch，但是实际上我们需要数据是流式的源源不断获取的，这种对异步进行的等待与流式数据的获取是否矛盾呢？其中我们可以首先通过后端调试输出，观察此处这个`reponse`返回的内容：

```json
Response {
  status: 200,
  statusText: 'OK',
  headers: Headers {
    date: 'Sun, 19 Apr 2026 08:45:50 GMT',
    'content-type': 'text/event-stream',
    'transfer-encoding': 'chunked',
    connection: 'keep-alive',
    'x-siliconcloud-trace-id': 'ti_mi7iq26xtnz40pitb5',
    'cache-control': 'no-cache'
  },
  body: ReadableStream { locked: false, state: 'readable', supportsBYOB: true },
  bodyUsed: false,
  ok: true,
  redirected: false,
  type: 'basic',
  url: 'https://api.siliconflow.cn/v1/chat/completions'
}
```

很容易发现，我们需要的实际内容正是在body中的，而他直接显示为`ReadableStream { locked: false, state: 'readable', supportsBYOB: true }`，即一个`ReadableStream`。而仅关键信息和请求头是完备的。

启动后端后，通过Bruno进行请求，观察得到的访问数据（以下是其中一条，这里将`id`和`created`信息隐去）：
```json
data: {
    "id":"***",
    "object":"chat.completion.chunk",
    "created":***,
    "model":"Qwen/Qwen3-8B",
    "choices":[
        {
            "index":0,
            "delta":{
                "content":"",
                "reasoning_content":"助手",
                "role":"assistant"
            },
            "finish_reason":null
        }
    ],
    "system_fingerprint":"",
    "usage":{
        "prompt_tokens":10,
        "completion_tokens":50,
        "total_tokens":60,
        "completion_tokens_details":{
            "reasoning_tokens":50
        },
        "prompt_tokens_details":{
            "cached_tokens":0
        },
        "prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":10
    }
}


```
很明显，`data`中的`reasoning_content`是模型输出的内容，但是这并不是我们要找的内容，因为这一个`reasoning_content`字段，是模型思考时的输出，他也会使用模型的token并返回到前端，但是不会被输出（如果你想要渲染思考过程的话也可以把他输出出来），在思考完成后，真正需要输入的信息在`content`这个字段中。

以上的一个`json`，就是后端返回的其中一个`chunk`。那么最后一个`chunk`是什么样子呢，只需看一看Bruno最后一次返回的内容：
```json
data: [DONE]


```
因此，看到这个`[Done]`的标识，就知道大模型已经完成了回答，可以通过`res.end()`结束连接了。

### 增加鲁棒性

为增加后端API的鲁棒性，可以考虑使用`try-catch`来进行判断，在出现各种问题时通过状态码完成错误的动态处理。

## 构建API

完成后端API后，现在开始编写前端API。注意，不同于后端，此处使用`typeScript`语法，而不是`javaScript`语法。
一般来说，我喜欢在前端使用`axios`进行接口编写，通过`AxiosInstance`创建实例执行操作，但此处面临的问题是：
- axios 在浏览器端无法稳定读取 response body 流
所以，我们这里直接使用原生的 fetch 完成工作。

```ts
export function sendMessageStreamApi(
  input: string,
  onChunk: (chunk: string, done: boolean) => void,
  options?: {
    model?: string | null;
    req_id?: string | null;
    signal?: AbortSignal;
    extraHeaders?: Record<string, string>;
  }
) {
  const url = "http://localhost:3000/llm/chat";
  const payload = {
    model: options?.model ?? null,
    req_id: options?.req_id ?? null,
    input,
    stream: true,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.extraHeaders || {}),
  };
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const signal = options?.signal;

  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  })
    .then(async (resp) => {
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`stream request failed: ${resp.status} ${txt}`);
      }

      if (!resp.body) {
        const text = await resp.text().catch(() => "");
        onChunk(text || "", true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; // 用于存储不完整的行

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // 处理缓冲区中剩余的数据
            if (buffer.trim()) {
              processLine(buffer.trim());
            }
            onChunk("", true);
            break;
          }

          // 解码并添加到缓冲区
          buffer += decoder.decode(value, { stream: true });
          
          // 按行分割（SSE 格式是按行分隔的）
          const lines = buffer.split(/\r?\n/);
          
          // 保留最后一行（可能不完整）
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            processLine(line);
          }
        }
      } catch (err) {} finally {
        try {
          await reader.cancel();
        } catch (e) { }
      }

      function processLine(line: string) {
        line = line.trim();
        if (!line) return;

        // 处理 SSE 格式: data: {...}
        if (line.startsWith("data:")) {
          const dataContent = line.substring(5).trim();

          if (dataContent === "[DONE]" || dataContent === "[done]") {
            return;
          }

          try {
            const parsed = JSON.parse(dataContent);
            
            // 根据你提供的格式解析
            // choices[0].delta.content 是内容
            if (parsed.choices && 
                Array.isArray(parsed.choices) && 
                parsed.choices.length > 0) {
              
              const choice = parsed.choices[0];
              const content = choice.delta?.content;
              
              if (content) {
                onChunk(String(content), false);
              }
            }
          } catch (e) { }
        } else if (line.startsWith(":")) {
          // SSE 注释行，忽略
          return;
        } else {
          // 非标准格式，尝试直接解析
          try {
            const parsed = JSON.parse(line);
            if (parsed.choices?.[0]?.delta?.content) {
              onChunk(String(parsed.choices[0].delta.content), false);
            }
          } catch (e) { }
        }
      }
    }).catch((err) => { });
}
```

## 前端调用

在完成API后，我们进入我们的Vue文件实现对其的调用，由于是通过流式进行调用，前文已经提到，`onChunk()`回调函数是会被大量调用的。
```ts
const onSend = async () => {
  const text = input.value?.trim();
  messages.value.push({ role: "user", content: text });
  input.value = "";
  await scrollToBottom();

  const assistantMsg: Message = {
    role: "assistant",
    content: "",
    streaming: true,
  };
  messages.value.push(assistantMsg);
  await scrollToBottom();

  sending.value = true;
  streamAbortController = new AbortController();

  try {
    await sendMessageStreamApi(
      text,
      (chunk: string, done: boolean) => {
        if (done) {
          assistantMsg.streaming = false;
          sending.value = false;
          streamAbortController = null;
          scrollToBottom();
        } else {
          nextTick(() => {
            assistantMsg.content += chunk;
            messages.value.pop();
            messages.value.push(assistantMsg);
            scrollToBottom();
          });
        }
      },
    )
  }catch(err){
    
  }
};
```
完成这个调用流程后，只需在发送按钮处绑定事件即可，不再赘述。
*Written in 4/19/2026 By Ruize Li*