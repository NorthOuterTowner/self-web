---
title: 如何使用配置文件完成软件项目的配置
lede: 在软件工程的发展过程中，配置文件经过了多种转变，从普通的文本文件充当配置文件，逐步演进为 json，xml和yaml等多种配置文件格式，以达成机器阅读方便和人类撰写方便的平衡，本文旨在讨论在当前的软件架构下，各种配置文件所具有的优劣。
date: 2026-10-04
tags: [Architecture, file]
---

在进行不同配置文件的对比之前，我们首先要明确对于当代的配置文件，应当承载何种的功能，以及如何承载这些功能。

## 配置文件所应承载的功能

配置文件，顾名思义，应当承载配置的功能，即不包含程序的业务逻辑，但包含配置的内容，这些内容应该放置在配置文件中。同时，有时我们不仅需要考虑语义，也需要考虑安全性，比如说对于数据库的密码或者大模型的API_KEY这类内容，直接放在业务代码中，一旦上传到公开的代码仓库，就可能导致关键信息的泄露。综上所述，常见的在配置文件中撰写的内容，一般包括数据库相关的内容，包括数据库的URL，端口号，密码，大模型相关的内容，比如API_KEY，模型名称，以及用户偏好相关的内容，有时也承载大型系统的功能开放配置，如某项功能的开与关。

### 配置驱动设计

这里我想要阐述一种设计模式，是配置驱动的设计，即对于大量同质化的内容，可以通过配置驱动的方式实现低代码的需求，如一个页面有大量的同质化按钮，每个按钮只调用不同的后端api，在这种情况下，比较合适的项目完成方式是撰写一个配置文件，每个按钮包括按钮的label，所属的group，所需的权限和访问的api即可，这样业务相关的工程师就不必撰写具体的项目代码。比如下面这种情况：

```json
{
    "groupA": {
        "btn1": {
            "label": "button1",
            "permission": "user",
            "api": "/user/btn1"
        },
        "btn2": {
            "label": "button2",
            "permission": "user",
            "api": "/user/btn2"
        }
    },
    "groupB": {
        "btn1": {
            "label": "admin-button1",
            "permission": "admin",
            "api": "/admin/btn1"
        }
    }
}
```

但需要注意的是，并非在任何情况下都应该使用配置文件，比如在不同功能之间有较大差异的情况下就不应该，可以看下面这种情况：

```json
{
    "groupA": {
        "btn1": {
            "label": "button1",
            "permission": "user",
            "api": "/user/btn1",
            "input1":"Branch",
            "input2":"Freq",
            "radio": {
                "label": "product",
                "selectable": ["A", "B", "C", "N"]
            }
        },
        "btn2": {
            "label": "button2",
            "permission": "user",
            "api": "/user/btn2",
            "text1":"content"
        }
    },
    "groupB": {
        "btn1": {
            "label": "admin-button1",
            "permission": "admin",
            "api": "/admin/btn1",
            "multiselect": {
                "label": "Branch",
                "selectable": [1,2,3,4,5]
            }
        }
    }
}
```

各种情况全部不同，在这种情况下，不宜使用配置文件增加负担。另外，一旦配置文件过于复杂且庞大，会显著增加开发人员的维护成本与理解成本，当配置文件开始承载大量业务逻辑时，实际上是在配置文件中重新实现一套编程语言，这通常不是一种理想的软件设计方式。
当然，对于以上的复杂场景，我们也可以使用配置驱动，但不是配置文件，就像下面这样：

```ts
export const aclrConfig: TestConfig = {
  label: "ACLR",

  fields: [
    {
      name: "freq",
      type: "number"
    }
  ]
}
```

## 文本文件

最早期的软件配置文件通常采用纯文本格式，例如

```env
SERVER_IP=127.0.0.1
PORT=8080
DEBUG=true
```

或者是：

```ini
[database]
host=localhost
port=3306
```

格式简单，便于人类阅读，便于解析。但缺少层级结构，难以表达嵌套的数组和对象。

## json文件

这是当前软件工程中最广泛使用的配置格式之一。

```json
{
  "database": {
    "host": "localhost",
    "port": 3306
  }
}
```

其结构清晰，前后端统一，且使用起来对于机器十分友好，如python支持`json.loads()`，ts支持`JSON.parse()`。
但其具备一个显著的缺点——**不支持注释**。
因此一旦配置复杂，就会导致维护的成本快速增加，也会存在大量的语法噪音，导致手工维护的体验极差。

## xml文件

XML曾经是企业级软件的主流配置格式。其具有强大的层级表达能力，支持 Schema 校验，从而严格的进行格式约束。但结构冗长，作为一种标签化的语言，消耗的字符数量多，占用空间较大。对于json能够快速解决的一个：

```json
{
    "products":[
        "product1":{
            "name": "a",
            "number": 1
        }
    ]
}
```

在 XML 中要使用

```xml
<products>
    <product>
        <name>a</name>
        <number>1</number>
    </product>
</products>
```

随着现代前后端的演进，XML已经逐渐被json所取代了。

## yaml文件

yaml文件是当今十分流行的配置文件，其支持注释，具有良好的可读性，且内容不冗长，接近自然人类语言。

我们以数据库配置举例，对于几种配置文件分别需要使用如下内容来完成配置信息：

1. ini:

    ```ini
    database.host="localhost"
    database.password="123456"
    database.name="DB1"
    ```

2. json:

    ```json
    {
        "database": {
            "host": "localhost",
            "password": "123456",
            "name": "DB1"
        }
    }
    ```

3. xml:

    ```xml
    <database>
        <host>localhost</host>
        <password>123456</password>
        <name>DB1</name>
    </database>
    ```

4. yaml:

    ```yaml
    # 数据库配置
    database:
        host: localhost
        password: 123456
        name: DB1
    ```

便捷性显而易见。

但在使用yaml时，也有需要注意的问题，对于配置驱动前端一类的涉及，使用这种文件会导致文件冗长，往往容易出现缩进错误和维护问题。

## 总结

配置文件的目标从来不是消灭代码，而是降低变化成本。如果某一部分功能频繁变化且具有高度同质性，那么它适合配置化；如果某一部分功能具有复杂业务逻辑和高度个性化特征，那么它更适合作为代码维护。好的架构并非追求“万物皆配置”，而是在配置与代码之间找到合理的边界。
