import ExpoModulesCore
import UIKit

/// Màn hình khách trên màn hình ngoài của iPad (HDMI / USB-C / AirPlay). JS gửi cả trạng thái (JSON đã định dạng sẵn chữ
/// và số tiền) mỗi lần đổi — xem src/services/customer-display.ts; module giữ bản cuối để vẽ lại khi cắm màn hình.
public class CustomerDisplayModule: Module {
  private var window: UIWindow?
  private var controller: CustomerDisplayViewController?
  private var lastState: String?
  private var observers: [NSObjectProtocol] = []
  /// Cập nhật trên luồng chính (UIKit); isAvailable đọc bản này thay vì gọi UIKit từ luồng JS.
  private var available = false

  public func definition() -> ModuleDefinition {
    Name("CustomerDisplay")

    Events("onDisplayChange")

    OnCreate {
      let center = NotificationCenter.default
      let changed: (Notification) -> Void = { [weak self] _ in
        DispatchQueue.main.async {
          guard let self = self else { return }
          let available = CustomerDisplayModule.externalScreen() != nil
          self.available = available
          self.sendEvent("onDisplayChange", ["available": available])
          if available { self.renderLast() } else { self.teardown() }
        }
      }
      self.observers.append(center.addObserver(forName: UIScreen.didConnectNotification, object: nil, queue: .main, using: changed))
      self.observers.append(center.addObserver(forName: UIScreen.didDisconnectNotification, object: nil, queue: .main, using: changed))
      if #available(iOS 13.0, *) {
        self.observers.append(center.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main, using: changed))
        self.observers.append(center.addObserver(forName: UIScene.didDisconnectNotification, object: nil, queue: .main, using: changed))
      }
      DispatchQueue.main.async { self.available = CustomerDisplayModule.externalScreen() != nil }
    }

    OnDestroy {
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      self.observers.removeAll()
      DispatchQueue.main.async { self.teardown() }
    }

    Function("isAvailable") { () -> Bool in
      return self.available
    }

    Function("render") { (state: String) in
      self.lastState = state
      DispatchQueue.main.async { self.renderLast() }
    }

    Function("hide") {
      self.lastState = nil
      DispatchQueue.main.async { self.teardown() }
    }

    Function("setKeepAwake") { (on: Bool) in
      DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = on }
    }
  }

  /// Màn hình ngoài đầu tiên (khác màn hình chính của máy).
  static func externalScreen() -> UIScreen? {
    return UIScreen.screens.first(where: { $0 != UIScreen.main })
  }

  private func makeWindow(for screen: UIScreen) -> UIWindow {
    // App dùng UIScene: màn hình ngoài là một scene riêng (vai trò external display) — gắn cửa sổ vào scene đó.
    if #available(iOS 16.0, *) {
      let scene = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .first { $0.session.role == .windowExternalDisplayNonInteractive }
      if let scene = scene {
        return UIWindow(windowScene: scene)
      }
    }
    // App không dùng UIScene: cửa sổ đặt thẳng lên màn hình ngoài.
    let created = UIWindow(frame: screen.bounds)
    created.screen = screen
    return created
  }

  private func renderLast() {
    guard let state = lastState else { return teardown() }
    guard let screen = CustomerDisplayModule.externalScreen() else { return teardown() }
    if window == nil || controller == nil {
      let created = makeWindow(for: screen)
      let vc = CustomerDisplayViewController()
      created.rootViewController = vc
      created.isHidden = false
      window = created
      controller = vc
    }
    controller?.render(state)
  }

  private func teardown() {
    controller?.stop()
    window?.isHidden = true
    window = nil
    controller = nil
  }
}
