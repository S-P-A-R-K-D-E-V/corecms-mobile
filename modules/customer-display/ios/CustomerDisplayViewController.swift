import AVFoundation
import UIKit

/// Nội dung màn hình khách dựng bằng UIKit (không chạy React trên màn hình ngoài): quảng cáo (ảnh / video xoay vòng), giỏ
/// hàng + tổng, mã QR chuyển khoản, "Cảm ơn quý khách". Cùng dạng JSON với bản Android (CustomerPresentation.kt).
final class CustomerDisplayViewController: UIViewController {
  private static let background = UIColor(red: 11 / 255, green: 15 / 255, blue: 20 / 255, alpha: 1)
  private static let muted = UIColor(red: 170 / 255, green: 178 / 255, blue: 189 / 255, alpha: 1)
  private static let faint = UIColor(red: 120 / 255, green: 128 / 255, blue: 140 / 255, alpha: 1)
  private static let success = UIColor(red: 34 / 255, green: 197 / 255, blue: 94 / 255, alpha: 1)

  private let content = UIView()
  private var lastMode: String?
  private var lastAdsKey: String?
  private var slideTimer: Timer?
  private var player: AVPlayer?
  private var playerLayer: AVPlayerLayer?
  private var endObserver: NSObjectProtocol?
  private var pendingState: String?

  private var unit: CGFloat {
    let size = view.bounds.size
    let side = min(size.width, size.height)
    return max(12, side / 24)
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = Self.background
    content.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(content)
    NSLayoutConstraint.activate([
      content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      content.topAnchor.constraint(equalTo: view.topAnchor),
      content.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    if let state = pendingState {
      pendingState = nil
      render(state)
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    playerLayer?.frame = content.bounds
  }

  func stop() {
    stopSlides()
  }

  func render(_ json: String) {
    guard isViewLoaded else {
      pendingState = json
      return
    }
    guard
      let data = json.data(using: .utf8),
      let state = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else { return }

    let mode = state["mode"] as? String ?? "idle"
    if mode == "idle" {
      let adsData = (state["ads"]).flatMap { try? JSONSerialization.data(withJSONObject: $0) }
      let adsKey = (adsData.flatMap { String(data: $0, encoding: .utf8) } ?? "") + "|" + (state["storeName"] as? String ?? "")
      if lastMode == "idle" && adsKey == lastAdsKey { return }
      lastAdsKey = adsKey
    }
    lastMode = mode
    stopSlides()
    content.subviews.forEach { $0.removeFromSuperview() }

    switch mode {
    case "cart": renderCart(state)
    case "qr": renderQr(state)
    case "paid": renderPaid(state)
    default: renderAds(state)
    }
  }

  // MARK: - Quảng cáo

  private func stopSlides() {
    slideTimer?.invalidate()
    slideTimer = nil
    if let observer = endObserver {
      NotificationCenter.default.removeObserver(observer)
      endObserver = nil
    }
    player?.pause()
    player = nil
    playerLayer?.removeFromSuperlayer()
    playerLayer = nil
  }

  private func renderAds(_ state: [String: Any]) {
    let ads = state["ads"] as? [String: Any]
    let slides = ads?["slides"] as? [[String: Any]] ?? []
    let interval = TimeInterval(min(120, max(3, ads?["interval"] as? Int ?? 8)))
    if slides.isEmpty {
      let stack = column()
      stack.alignment = .center
      let name = (state["storeName"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Xin chào quý khách"
      stack.addArrangedSubview(label(name, scale: 2.2, bold: true, center: true))
      stack.addArrangedSubview(label("Cảm ơn quý khách đã ghé cửa hàng", scale: 1, color: Self.muted, center: true))
      pin(stack, centered: true)
      return
    }
    showSlide(slides, index: 0, interval: interval)
  }

  private func showSlide(_ slides: [[String: Any]], index: Int, interval: TimeInterval) {
    stopSlides()
    content.subviews.forEach { $0.removeFromSuperview() }
    let slide = slides[index % slides.count]
    let next: () -> Void = { [weak self] in self?.showSlide(slides, index: (index + 1) % slides.count, interval: interval) }
    let url = slide["url"] as? String ?? ""

    if (slide["kind"] as? String) == "video", let videoUrl = URL(string: url) {
      let item = AVPlayerItem(url: videoUrl)
      let player = AVPlayer(playerItem: item)
      player.isMuted = true
      let layer = AVPlayerLayer(player: player)
      layer.videoGravity = .resizeAspect
      layer.frame = content.bounds
      content.layer.addSublayer(layer)
      self.player = player
      self.playerLayer = layer
      endObserver = NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
      ) { [weak self] _ in
        if slides.count > 1 {
          next()
        } else {
          self?.player?.seek(to: .zero)
          self?.player?.play()
        }
      }
      player.play()
    } else {
      let image = UIImageView()
      image.contentMode = .scaleAspectFit
      pin(image, centered: false)
      CustomerDisplayImageLoader.load(url) { loaded in image.image = loaded }
      if slides.count > 1 {
        slideTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { _ in next() }
      }
    }

    if let title = slide["title"] as? String, !title.isEmpty {
      let caption = label(title, scale: 1.2, bold: true)
      caption.backgroundColor = UIColor(white: 0, alpha: 0.55)
      caption.translatesAutoresizingMaskIntoConstraints = false
      content.addSubview(caption)
      NSLayoutConstraint.activate([
        caption.leadingAnchor.constraint(equalTo: content.leadingAnchor),
        caption.trailingAnchor.constraint(equalTo: content.trailingAnchor),
        caption.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      ])
    }
  }

  // MARK: - Giỏ hàng

  private func renderCart(_ state: [String: Any]) {
    guard let cart = state["cart"] as? [String: Any] else { return renderAds(state) }
    let landscape = view.bounds.width > view.bounds.height

    let left = column()
    let title = (cart["title"] as? String) ?? (state["storeName"] as? String) ?? ""
    left.addArrangedSubview(label(title, scale: 0.95, color: Self.muted))
    let list = column(spacing: unit * 0.5)
    let lines = cart["lines"] as? [[String: Any]] ?? []
    for line in lines {
      let row = UIStackView()
      row.axis = .horizontal
      row.alignment = .center
      row.spacing = unit * 0.5
      let info = column(spacing: 2, padding: 0)
      info.addArrangedSubview(label(line["name"] as? String ?? "", scale: 1.05, bold: true, single: true))
      if let detail = line["detail"] as? String, !detail.isEmpty {
        info.addArrangedSubview(label(detail, scale: 0.75, color: Self.faint, single: true))
      }
      info.addArrangedSubview(label(line["qty"] as? String ?? "", scale: 0.85, color: Self.muted))
      row.addArrangedSubview(info)
      let amount = label(line["amount"] as? String ?? "", scale: 1.05, bold: true)
      amount.setContentHuggingPriority(.required, for: .horizontal)
      amount.setContentCompressionResistancePriority(.required, for: .horizontal)
      row.addArrangedSubview(amount)
      list.addArrangedSubview(row)
    }
    let scroll = UIScrollView()
    list.translatesAutoresizingMaskIntoConstraints = false
    scroll.addSubview(list)
    NSLayoutConstraint.activate([
      list.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
      list.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
      list.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      list.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      list.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
    ])
    left.addArrangedSubview(scroll)

    let right = column()
    right.backgroundColor = UIColor(white: 1, alpha: 0.04)
    let spacer = UIView()
    spacer.setContentHuggingPriority(.defaultLow, for: .vertical)
    right.addArrangedSubview(spacer)
    if let customer = cart["customer"] as? String, !customer.isEmpty {
      right.addArrangedSubview(label(customer, scale: 1))
    }
    for total in cart["totals"] as? [[String: Any]] ?? [] {
      let text = total["label"] as? String ?? ""
      let value = total["value"] as? String ?? ""
      if (total["strong"] as? Bool) == true {
        right.addArrangedSubview(label(text, scale: 1.1, bold: true, single: true))
        let big = label(value, scale: 2.4, bold: true, single: true)
        big.textAlignment = .right
        right.addArrangedSubview(big)
      } else {
        let row = UIStackView(arrangedSubviews: [label(text, scale: 0.9, color: Self.muted, single: true), label(value, scale: 0.9)])
        row.axis = .horizontal
        row.distribution = .equalSpacing
        right.addArrangedSubview(row)
      }
    }

    let outer = UIStackView(arrangedSubviews: [left, right])
    outer.axis = landscape ? .horizontal : .vertical
    outer.distribution = .fill
    pin(outer, centered: false)
    if landscape {
      right.widthAnchor.constraint(equalTo: outer.widthAnchor, multiplier: 0.42).isActive = true
    }
    DispatchQueue.main.async {
      let bottom = CGPoint(x: 0, y: max(0, scroll.contentSize.height - scroll.bounds.height))
      scroll.setContentOffset(bottom, animated: true)
    }
  }

  // MARK: - QR chuyển khoản

  private func renderQr(_ state: [String: Any]) {
    guard let qr = state["qr"] as? [String: Any] else { return renderAds(state) }
    let landscape = view.bounds.width > view.bounds.height
    let side = min(view.bounds.width, view.bounds.height) * 0.72

    let frame = UIView()
    frame.backgroundColor = .white
    frame.layer.cornerRadius = unit * 0.6
    let image = UIImageView()
    image.contentMode = .scaleAspectFit
    image.translatesAutoresizingMaskIntoConstraints = false
    frame.addSubview(image)
    let inset = unit * 0.5
    NSLayoutConstraint.activate([
      image.leadingAnchor.constraint(equalTo: frame.leadingAnchor, constant: inset),
      image.trailingAnchor.constraint(equalTo: frame.trailingAnchor, constant: -inset),
      image.topAnchor.constraint(equalTo: frame.topAnchor, constant: inset),
      image.bottomAnchor.constraint(equalTo: frame.bottomAnchor, constant: -inset),
      frame.widthAnchor.constraint(equalToConstant: side),
      frame.heightAnchor.constraint(equalToConstant: side),
    ])
    CustomerDisplayImageLoader.load(qr["imageUrl"] as? String ?? "") { loaded in image.image = loaded }

    let info = column(spacing: unit * 0.3, padding: 0)
    info.addArrangedSubview(label((qr["title"] as? String) ?? "Quét mã để thanh toán", scale: 1.4, bold: true))
    info.addArrangedSubview(label(qr["amount"] as? String ?? "", scale: 2.8, bold: true))
    for extra in qr["lines"] as? [String] ?? [] {
      info.addArrangedSubview(label(extra, scale: 0.95, color: Self.muted))
    }

    let outer = UIStackView(arrangedSubviews: [frame, info])
    outer.axis = landscape ? .horizontal : .vertical
    outer.alignment = .center
    outer.spacing = unit * 2
    pin(outer, centered: true)
  }

  // MARK: - Đã thanh toán

  private func renderPaid(_ state: [String: Any]) {
    let paid = state["paid"] as? [String: Any]
    let stack = column()
    stack.alignment = .center
    let check = label("✓", scale: 3, bold: true, center: true)
    let d = unit * 4.5
    check.backgroundColor = Self.success
    check.layer.cornerRadius = d / 2
    check.clipsToBounds = true
    check.widthAnchor.constraint(equalToConstant: d).isActive = true
    check.heightAnchor.constraint(equalToConstant: d).isActive = true
    stack.addArrangedSubview(check)
    let title = (paid?["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Cảm ơn quý khách!"
    stack.addArrangedSubview(label(title, scale: 2.4, bold: true, center: true))
    if let amount = paid?["amount"] as? String, !amount.isEmpty {
      stack.addArrangedSubview(label(amount, scale: 1.2, color: Self.muted, center: true))
    }
    if let store = state["storeName"] as? String, !store.isEmpty {
      stack.addArrangedSubview(label("\(store) hẹn gặp lại", scale: 0.9, color: Self.faint, center: true))
    }
    pin(stack, centered: true)
  }

  // MARK: - Tiện ích dựng view

  private func column(spacing: CGFloat? = nil, padding: CGFloat? = nil) -> UIStackView {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = spacing ?? unit * 0.4
    let pad = padding ?? unit * 1.2
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: pad, left: pad, bottom: pad, right: pad)
    return stack
  }

  private func label(_ text: String, scale: CGFloat, color: UIColor = .white, bold: Bool = false, center: Bool = false, single: Bool = false) -> UILabel {
    let view = UILabel()
    view.text = text
    view.textColor = color
    view.font = .systemFont(ofSize: unit * scale, weight: bold ? .bold : .regular)
    view.numberOfLines = single ? 1 : 0
    view.lineBreakMode = single ? .byTruncatingTail : .byWordWrapping
    view.adjustsFontSizeToFitWidth = single
    view.minimumScaleFactor = 0.6
    if center { view.textAlignment = .center }
    return view
  }

  private func pin(_ child: UIView, centered: Bool) {
    child.translatesAutoresizingMaskIntoConstraints = false
    content.addSubview(child)
    if centered {
      NSLayoutConstraint.activate([
        child.centerXAnchor.constraint(equalTo: content.centerXAnchor),
        child.centerYAnchor.constraint(equalTo: content.centerYAnchor),
        child.leadingAnchor.constraint(greaterThanOrEqualTo: content.leadingAnchor),
        child.trailingAnchor.constraint(lessThanOrEqualTo: content.trailingAnchor),
      ])
    } else {
      NSLayoutConstraint.activate([
        child.leadingAnchor.constraint(equalTo: content.leadingAnchor),
        child.trailingAnchor.constraint(equalTo: content.trailingAnchor),
        child.topAnchor.constraint(equalTo: content.topAnchor),
        child.bottomAnchor.constraint(equalTo: content.bottomAnchor),
      ])
    }
  }
}

/// Tải ảnh (http(s) hoặc data:image;base64), nhớ đệm theo URL; gọi lại trên luồng chính.
enum CustomerDisplayImageLoader {
  private static let cache = NSCache<NSString, UIImage>()

  static func load(_ url: String, done: @escaping (UIImage?) -> Void) {
    if url.isEmpty { return done(nil) }
    if let cached = cache.object(forKey: url as NSString) { return done(cached) }
    if url.hasPrefix("data:") {
      let base64 = url.components(separatedBy: ",").last ?? ""
      let image = Data(base64Encoded: base64, options: .ignoreUnknownCharacters).flatMap { UIImage(data: $0) }
      if let image = image { cache.setObject(image, forKey: url as NSString) }
      return done(image)
    }
    guard let remote = URL(string: url) else { return done(nil) }
    URLSession.shared.dataTask(with: remote) { data, _, _ in
      let image = data.flatMap { UIImage(data: $0) }
      if let image = image { cache.setObject(image, forKey: url as NSString) }
      DispatchQueue.main.async { done(image) }
    }.resume()
  }
}
