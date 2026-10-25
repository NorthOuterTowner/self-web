---
title: 仪器设备的 SCPI 命令
lede: 通过 VISA 进行仪器的连接，通过 SCPI 进行仪器的使用。
date: 2026-10-25
tags: [IDE]
---

在 VISA 协议的一章，我们了解了如何通过 PyVISA 进行仪器资源的管理和连接，如何实现对仪器仪表的控制，但是在那一章中，也出现了一些难以理解的，不属于 Python 层面的内容，比如 "IDN?" 这样的字符串，这就是我们在这一章中谈到的内容——SCPI命令。

## 基本结构

一个 SCPI 命令通常由命令头+参数构成，如

```text
SOUR:FREQ 1GHz # write
SOUR:FREQ? # read
```

含义是“信号源子系统：频率功能：设置值”

## 常见命令

1. *IDN?

    查询仪器身份：

    ```py
    print(inst.query("*IDN?"))
    ```

    可能返回形如：Manufacturer,Model,SerialNumber,Version这样的结果。

2. *RST

    复位仪器：

    ```py
    inst.write("*RST")
    ```

    清除当前配置、关闭输出或恢复默认状态。

3. *CLS

   清除状态和错误信息。

4. *OPC?

    查询仪器是否完成操作，当仪器完成操作后，通常会返回1，这个命令通常用于等待长时间的测量完成，如：

    ```py
    inst.write("INIT")
    print(inst.query("*OPC?"))
    ```

5. *WAI

    等待前面的操作完成，不会像 *OPC 那样返回结果，而是让仪器进行等待。

6. *STB

    查询状态字节，如：

    ```py
    status = inst.query("*STB")
    ```

## 其他

对于其他仪器系统命令，不同类型的仪器有不同的子系统，比如信号源常用`:SOUR`，万用表常用`:CONF` 等等，但需要注意的是，SCPI 不保证所有仪器命令完全一样，所以正确的流程是：

所以正确流程通常是：

1. 确认仪器支持 SCPI；
2. 找到对应型号的编程手册；
3. 查找命令树；
4. 按手册发送命令。
