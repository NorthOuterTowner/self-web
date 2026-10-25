---
title: VISA协议从入门到精通
lede: 记录关于VISA协议的各个方面的知识
date: 2026-10-07
tags: [IDE]
---

本文包括VISA协议的含义，其与TCP/IP，或者HTTP一类协议的区别，以及如何通过pyvisa等方式连接以VISA协议进行区分的设备。

## VISA 与 PyVISA

全称为 Virtual Instrument Software Architecture，规定了程序如何通过统一接口进行仪器的访问，支持多种连接方式，主要包括：GPIB，USB，串口，LAN，VXI和PXI等。

其位于程序和仪器硬件通信驱动之间，为上层程序提供了统一的编程接口。

如果不使用 pyVISA，需要针对不同的仪器和接口进行分别处理，包括USB，GPIB等的底层通信，不同厂商的驱动和 API，资源管理的细节，等等。

pyVISA 把这些常见的操作统一成了 python 的 API，进行了接口的规范化。仪器的资源字符串基本形如：

| 接口 | 示例 |
| --- | --- |
| USBTMC | USB0::0x0699::0x0000::123456::INSTR |
| GPIB | GPIB0::5::INSTR |
| LAN/VXI-11 | TCPIP0::192.168.1.100::inst0::INSTR |
| HiSLIP | TCPIP0::192.168.1.100::hislip0::INSTR |
| Raw Socket | TCPIP0::192.168.1.100::5025::SOCKET |
| 串口 | ASRL3::INSTR |

## USB

对于一个 USB 连接的设备，PyVISA 中通常显示为 `USB0::0x0699::0x0000::123456::INSTR`，含义为第一个 USB VISA 接口（USB0），0x0699，0x0000和123456分别为厂商id，产品id和序列号，最后的 INSTR 表示仪器资源。

比如：

```py
import pyvisa

rm = pyvisa.ResourceManager()
print(rm.list_resources())

inst = rm.open_resource(
    "USB0::0x0699::0x0000::123456::INSTR"
)

inst.timeout = 5000

print(inst.query("*IDN?"))
```

## GPIB

GPIB，即总线连接，为仪器的 GPIB 接口连接 GPIB 电缆，再经过 USB-GPIB 控制器连接到电脑，电脑不能直接进行 GPIB 的连接，所以需要 USB-GPIB 或者 PCI-GPIB 等控制器。

GPIB 是允许多个仪器连接在仪器的，在这种情况下，每台仪器都有一个自己的地址，如：

| 仪器 | 地址 |
| --- | --- |
| A | 5 |
| B | 10 |
| C | 12 |

那么对于仪器A，PyVISA 资源字符串即为 GPIB0::5::INSTR，表示第一个 GPIB 控制器，仪器主地址为5。

## TCP/IP

TCP/IP 常见的有三种通信方式，分别为 VXI-11，HiSLIP， Raw TCP Socket。下面分别进行说明

### VXI-11

非常典型的形如`TCPIP0::192.168.1.100::inst0::INSTR
`的资源字符串，就是以 VXI-11 的方式进行连接的。VXI-11 不是简单的打开一个端口，其有自己的协议层，所以不能简单的使用 socket 来替代，其优点非常显著，适合标准仪器控制，且通常可以直接相应`query()`，不过其也存在一个缺点，即协议开销比较大。

### HiSLIP

HiSLIP 可以解决 VXI-11 的协议开销比较大的问题，是较新的一种高速仪器 LAN 通信协议，适合高吞吐量，大数据量的应用，对于传输频谱数据、波形数据、IQ数据适宜使用。典型的资源字符串大致如：`TCPIP0::192.168.1.100::hislip0::INSTR`。

另外，有些仪器会支持多个 HiSLIP 会话，可以如下进行处理：

```text
TCPIP0::192.168.1.100::hislip0::INSTR
TCPIP0::192.168.1.100::hislip1::INSTR
```

如果仪器**同时支持 VXI-11 和 HiSLIP**，通常可以优先进行 HiSLIP 的尝试。

### Socket

Raw Socket属于最直接的 TCP 通信方式，电脑的 TCP 客户端直接连接仪器的 IP + TCP 端口，PyVISA 资源字符串通常是`TCPIP0::192.168.1.100::5025::SOCKET`。

对于这种 Socket 的形式，其完全基于 TCP/IP 的 Socket，所以也可以绕过 VISA，直接基于 Python Socket 进行连接的建立。

```py
# 假设 host 和 port 的值如下
host = "192.168.1.100"
port = 5025

with socket.create_connection((host, port), timeout=5) as s:
    s.sendall(b"*IDN?\n")
    data = s.recv(4096)

print(data.decode(errors="replace"))
```

但考虑PyVisa api 统一，资源管理方便，在涉及多台设备时，还是推荐直接全部使用 PyVISA 进行资源管理。

## PyVISA 的使用

使用 PyVISA 首先需要安装 python 包，但 PyVISA 本身不包括底层驱动，它通常还需要一个 VISA 后端。

### 资源创建

使用 PyVISA 时，首先需要进行 Resource Manager 的创建，之后可以查看所有设备。

```py
rm = pyvisa.ResourceManager()
resources = rm.list_resources()

'''
output:
{
    'USB0::0x0699::0x0000::123456::INSTR',
    'GPIB0::5::INSTR',
    'TCPIP0::192.168.1.100::inst0::INSTR'
}
'''
```

那么 `open_resource()` 到底起到什么作用呢，它首先解析资源字符串，让 VISA 后端打开对应的设备对话，之后返回一个 Python 对象 `inst`，于是就可以执行`print(inst.query("*IDN?"))`进行仪器通信的测试。

### 资源通信

PyVISA 最为核心的，就是`write()`，`read()`和`query()`三个函数，write写命令，read读取数据，query表示一次查询，因此在实际的使用中，往往直接使用query。

资源通信过程中的一个关键问题在于，仪器的通信通常需要命令的结束标志，比如`*IDN?\n`，意味着

```py
inst.write_termination = "\n"
inst.read_termination = "\n"
```

于是进行 write 和 read 操作时，pyVISA 会在 write 时自动补充 "\n"，并在 read 读取到 "\n" 时结束。

但对于不同的仪器，终止符可能是不同的，所以不能盲目的设置。

- Raw TCP Socket 通常需要显式终止符；
- GPIB 有时使用 EOI，不一定需要 \n；
- USBTMC 仪器可能已经由 USBTMC 协议处理消息边界。

程序结束时，需要切记关闭资源，否则可能出现各种各样的问题：

```py
inst.close()
rm.close()
```
