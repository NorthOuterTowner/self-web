---
title: GPG Key 的配置
lede: 本文将介绍如何在Git提交的过程中进行GPG key的配置。
date: 2026-10-14
tags: [Git, Gerrit]
order: 1
---

在一些代码提交情况下，尤其是 Gerrit 进行代码提交，需要进行签名认证提交者的身份，在这种情况下，一般需要进行 GPG 私钥和公钥的配置。

本文将详细介绍如何完成 GPG key 的一系列配置。

## 查看 GPG Key

首先查看本电脑是否已经存在生成好的 GPG Key。
(注：下面的命令，只要是以 `gpg` 开头的，都建议在 git bash 中运行，而不是 CMD)

```bash
gpg --list-secret-keys --keyid-format=long
```

如果不存在 GPG Key 则生成新的私钥，如果已经存在，可以记录 key id，直接进行配置操作。

## 配置私钥

用下面的命令生成私钥。

```bash
gpg --full-generate-key
gpg --list-secret-keys --keyid-format=long
```

选择 RSA and RSA，keysize 为 4096, Not Expired。

RSA 算法是一种非对称加密算法，安全性主要依赖于大整数分解困难这一数学问题。

keysize表示RSA密钥长度，一般来说，2048更加常用，速度更快，但4096的安全余量更大，生成和运算速度虽然稍慢，但在 Git Commit 签名中，其性能影响几乎可以忽略。

然后设置一个 passphrase，完成后将显示

```bash
sec rsa4096/<secret key id > \[SC\]
uid <your uid >
ssb rsa4096/<secret subkey id > \[E\]
```

其中的 sec 表示主密钥，ssb 表示子密钥。方括号中的 \[SC\] 或者 \[E\] 表示密钥的用途，S 表示 Sign（签名），C 表示 Certify（认证/签发子密钥），E 表示 Encrypt（加密）

```bash
git config --global user.name "<your name>"
git config --global user.email "<your email address>"
git config --global gpg.format openpgp
git config --global user.signingkey <new KEY_ID>
git config --global commit.gpgsign true
git config --global push.gpgsign if-asked
```

## 配置公钥

首先进行公钥的导出工作，输入下面的命令即可直接粘贴到剪切板。

```bash
gpg --armor --export <secret_key_id> | clip.exe
```

如果希望进一步进行公钥是否存在的确认，可以输入

```bash
git --armor --export <secret_key_id>
```

进入 Settings -> GPG Key -> Add New GPG Key，直接把刚刚复制的公钥内容进行粘贴即可。

以上内容已经完成了所有 GPG 配置，之后进入自己的 Git 仓库，完成 git commit 和 git push 相关的操作即可。

另外，如果 git push 出现问题，可以参考下面的方法。

## 修复 Commit

此时 git push 出现问题，可能是在 git commit 时还未带上私钥进行认证，因此会出现提交和认证的问题，可以对上一次 commit 进行重新签名。

```bash
git commit --amend --no-edit -S
```

之后重新进行 git push 类的操作即可。
