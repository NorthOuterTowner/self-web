---
title: 几种集成学习模型的原理与使用方法
lede: 近期在做 Machine Learning 相关的内容，发现对于很多 ML 的模型只是知道名字，但是对于其中的原理和应用很不了解，因此写一篇 blog 来简单记录。
date: 2026-10-03
tags: [Machine Learning, GBDT, XGBoost]
---

对于很多 ML 的模型我只是知道名字，对其中的原理和应用并不了解。这里记录当前使用的几种集成学习的原理以及对应的使用方法。

## XGBoost

### 总体训练过程
XGBoost采用前向分步算法，在每一棵树中始终以修复之前所有树累加之后的残差作为训练的目的。
同时，通过将树进行参数化，在正则化项中引入了 $\lambda$ 和 $\gamma$,来控制叶子节点的数量，防止树长得太深，同时控制叶子权重，避免某一棵树权重过大。
对于每一个待分裂的节点，尝试所有可能的特征和切分点计算分裂后的增益。
另外，XGBoost这种方法也有学习率的概念，通过学习率，来确定每棵树准备学习的残差的量，而不是让一棵树尝试去学习所有的结构，确保每一棵树只学习一部分的结构化信息，避免陷入局部最优解。

### 使用XGBoost进行训练
我仍然认为明确一种算法的使用场景，即在什么情况下使用，解决什么样的问题，大致以什么样的方式来使用，因此将着重讨论模型如何训练和如何预测的问题。
```python
import xgboost as xgb
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# 1. 加载数据
data = load_breast_cancer()
X, y = data.data, data.target
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 2. 初始化模型 (Scikit-Learn 风格)
model = xgb.XGBClassifier(
    n_estimators=100,       # 树的棵数
    learning_rate=0.1,      # 学习率 (eta)
    max_depth=6,            # 树的最大深度
    subsample=0.8,          # 训练每棵树时使用的样本比例（防止过拟合）
    colsample_bytree=0.8,   # 训练每棵树时使用的特征比例
    random_state=42,
    use_label_encoder=False,
    eval_metric='logloss'   # 损失函数
)

# 3. 训练模型
model.fit(X_train, y_train)

# 4. 预测
y_pred = model.predict(X_test)
print(f"准确率: {accuracy_score(y_test, y_pred):.4f}")
```

### 使用Pandas库
在数据分析的过程中，很多情况下使用`Pandas`库进行数据的读取。如读取`csv`文件：
```python
df = pd.read_csv('medical_data.csv')
X = df.drop('label', axix=1)
y = df['label']
```
读取后得到`DataFrame`对象，这是一个带有一些元数据的二维矩阵，我个人的理解是将整个表的内容，连同他的index和每个列的名称，全部读入了这个`DataFrame`中。
通过Column的名称，可以直接读取到一个“列”，如上述的`y=df['label']`就是这种做法，通过这种方式读取到的数据，其类型是`Series`。

在`Series`中具有`dtype`属性，返回这一类的值，此处有一个需要进行注意的点，即在较老的`pandas`版本中，要么是数值型`int64`（也可能是`float64`），要么是非数值型，任何非数值型都会显示为`object`，但在较新的版本中，如果内部均为`str`类型，则会显示为`str`，因此通过是否`object`的方法难以直接判断。如果你也遇到了类似的问题，可以尝试使用`Series.apply()`方法：
```python
series = df['label']

def transform(val):
    if isinstance(val, (str, bytes)):
        return str(val)
    else:
        return ''

s_new = series.apply(transform)
```
通过这样的方法对`Series`的内容逐个调用自定义的转换函数，从而确保不会出现问题。

## LightGBM
一种GBDT算法，似乎比XGBoost快，很好用。

## CatBoost

对于CatBoost的原理我不太了解，只清楚也是GBDT的一种，他对于特征的“分类特征”和“数值特征”进行了单独区分，对于数值特征可以使用float64和int64，但是对于分类特征只允许int64和str，而不允许real number或者NaN。
CatBoost有一个很有趣的一点，就是他对于分类特征，会将其进行编码，从int或str编码成为单独的数字，而不是通过one-hot编码，通过这种处理方式*似乎*可以提升该结构的性能。说似乎是看他们这么说，但是我实际使用的过程中感觉虽然比LightGBM略强，和XGBoost接近，但是实际上在工程上差别不大。
需要注意的一点是，对于CatBoost，最好不要在训练后进行col顺序的调整，因为当你传递列名进行辨别时，CatBoost内部是会将其转换为idx的，而这个idx是在训练时保存在内部的，也就是说如果你调整了col的顺序而之后又根据列名进行操作，如果你运气好的话，可能恰好由于提取的特征根本不符合规则导致CatBoost的pyc报错，但如果运气不好，则可能会在成功运行的情况下得出错误的答案。

## TabNet

这是一种**深度表格数据学习**（Deep Tabular Learning）架构。它的核心目标是在处理表格数据（Tabular Data）时，既能拥有深度学习的表征能力，又能保留决策树（如 XGBoost、LightGBM）的可解释性和特征选择优势。
TabNet作为一种深度学习算法，模仿了GBDT，在每一步学习一个掩码。他的每一步由两个部分组成：特征变换器（Feature Transformer）：负责提取特征。它分为两个部分：一部分参数是全局共享的（学习跨步骤的通用特征），另一部分是步骤特定的（学习当前步骤的特有特征）。为了保证训练稳定，它大量使用了 GLU（Gated Linear Units） 激活函数。注意力变换器（Attentive Transformer）：决定当前步骤该“看”哪些特征。它利用前一步处理过的信息，通过 $\mathrm{Softmax}$ 产生一个稀疏掩码。
BTW，感觉实力不如 XGBoost or TabNet。
