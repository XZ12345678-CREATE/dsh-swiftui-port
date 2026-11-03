---
name: dsh-swiftui-port
description: Port a bounded React Native or Expo feature into SwiftUI using a behavior contract, source fingerprints and actual project tests.
---

# SwiftUI 功能迁移

按一个明确页面或功能迁移，保留源文件证据与行为验收清单。

先确定具体 React Native/Expo 文件、允许写入的 SwiftUI 目录、API/持久化/认证/错误行为，以及源代码和素材许可。通过 `../../scripts/port.mjs plan --root PROJECT --input SPEC --out CONTRACT` 保存源文件哈希、目标文件和行为清单。不要把整应用重写作为默认范围。

在用户已授权的范围内实施 Swift/SwiftUI 代码，复用用户已选择的架构。模型负责理解与改写；helper 不是转译器。优先为纯 Swift 逻辑写项目实际可运行的测试，并为关键交互补充现有测试目标下的测试。

完成后使用 verify 检查源文件是否变化、目标文件是否存在，再用 test --contract CONTRACT --project relative/App.xcodeproj --scheme SCHEME，在已有 Xcode 工具链和项目内运行实际 xcodebuild test。destination 应匹配用户已安装模拟器。缺少工具链或测试目标时如实标记 blocked，不安装 Xcode、不虚构通过。

文件结构与测试退出码不能单独证明行为等价。逐项记录行为清单的实际验证，指出人工未覆盖部分；不保证 App Store 审核通过。用户未提供素材使用权时仅记录缺口，不擅自复制。
