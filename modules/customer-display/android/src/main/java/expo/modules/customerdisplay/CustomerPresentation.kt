package expo.modules.customerdisplay

import android.app.Presentation
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.LruCache
import android.util.TypedValue
import android.view.Display
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.VideoView
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Nội dung màn hình khách, dựng bằng View thường (không chạy React trên màn phụ): quảng cáo (ảnh / video xoay vòng),
 * giỏ hàng + tổng, mã QR chuyển khoản, "Cảm ơn quý khách". Chữ và số tiền do JS định dạng sẵn.
 */
internal class CustomerPresentation(outer: Context, display: Display) : Presentation(outer, display) {
  private val main = Handler(Looper.getMainLooper())
  private lateinit var root: FrameLayout
  private var lastMode: String? = null
  private var lastAdsKey: String? = null
  private var slideRunnable: Runnable? = null

  private val unit: Float by lazy {
    val m = context.resources.displayMetrics
    minOf(m.widthPixels, m.heightPixels) / 24f
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    root = FrameLayout(context).apply { setBackgroundColor(BG) }
    setContentView(root)
  }

  fun render(json: String) {
    val state = try {
      JSONObject(json)
    } catch (_: Throwable) {
      return
    }
    val mode = state.optString("mode", "idle")
    if (mode == "idle") {
      // Quảng cáo đang chạy, nội dung không đổi → không dựng lại (slideshow không bị quay về đầu).
      val adsKey = state.optJSONObject("ads")?.toString() + "|" + state.optString("storeName")
      if (lastMode == "idle" && adsKey == lastAdsKey) return
      lastAdsKey = adsKey
    }
    lastMode = mode
    stopSlides()
    root.removeAllViews()
    when (mode) {
      "cart" -> renderCart(state)
      "qr" -> renderQr(state)
      "paid" -> renderPaid(state)
      else -> renderAds(state)
    }
  }

  override fun onStop() {
    stopSlides()
    super.onStop()
  }

  // ── Quảng cáo ──────────────────────────────────────────────────────────────

  private fun stopSlides() {
    slideRunnable?.let { main.removeCallbacks(it) }
    slideRunnable = null
  }

  private fun renderAds(state: JSONObject) {
    val ads = state.optJSONObject("ads")
    val slides = ads?.optJSONArray("slides") ?: JSONArray()
    val interval = (ads?.optInt("interval", 8) ?: 8).coerceIn(3, 120) * 1000L
    if (slides.length() == 0) {
      val box = column(Gravity.CENTER)
      box.addView(text(state.optString("storeName").ifBlank { "Xin chào quý khách" }, 2.2f, bold = true, center = true))
      box.addView(text("Cảm ơn quý khách đã ghé cửa hàng", 1f, color = MUTED, center = true).apply { setPadding(0, (unit * 0.6f).toInt(), 0, 0) })
      root.addView(box, matchParent())
      return
    }
    showSlide(slides, 0, interval)
  }

  private fun showSlide(slides: JSONArray, index: Int, interval: Long) {
    if (!isShowing) return
    root.removeAllViews()
    val slide = slides.optJSONObject(index % slides.length()) ?: return
    val next = { showSlide(slides, (index + 1) % slides.length(), interval) }
    val url = slide.optString("url")
    if (slide.optString("kind") == "video") {
      val video = VideoView(context)
      root.addView(video, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER))
      video.setVideoURI(Uri.parse(url))
      video.setOnPreparedListener { player ->
        player.setVolume(0f, 0f)
        player.isLooping = slides.length() == 1
        video.start()
      }
      video.setOnCompletionListener { if (slides.length() > 1) next() }
      video.setOnErrorListener { _, _, _ ->
        if (slides.length() > 1) schedule(1000L) { next() }
        true
      }
    } else {
      val image = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
      root.addView(image, matchParent())
      ImageLoader.load(url) { bitmap -> if (bitmap != null) image.setImageBitmap(bitmap) }
      if (slides.length() > 1) schedule(interval) { next() }
    }
    val title = slide.optString("title")
    if (title.isNotBlank() && title != "null") {
      val caption = text(title, 1.2f, bold = true).apply {
        setPadding((unit * 1.2f).toInt(), (unit * 1.5f).toInt(), (unit * 1.2f).toInt(), (unit * 1f).toInt())
        background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.TRANSPARENT, Color.argb(190, 0, 0, 0)))
      }
      root.addView(caption, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
    }
  }

  private fun schedule(delay: Long, action: () -> Unit) {
    stopSlides()
    val r = Runnable { action() }
    slideRunnable = r
    main.postDelayed(r, delay)
  }

  // ── Giỏ hàng ───────────────────────────────────────────────────────────────

  private fun renderCart(state: JSONObject) {
    val cart = state.optJSONObject("cart") ?: return renderAds(state)
    val landscape = context.resources.displayMetrics.let { it.widthPixels > it.heightPixels }
    val row = LinearLayout(context).apply { orientation = if (landscape) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL }

    val left = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(pad(), pad(), pad(), pad())
    }
    left.addView(text(cart.optString("title").ifBlank { state.optString("storeName") }, 0.95f, color = MUTED))
    val list = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    val lines = cart.optJSONArray("lines") ?: JSONArray()
    for (i in 0 until lines.length()) {
      val line = lines.optJSONObject(i) ?: continue
      val item = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding((unit * 0.4f).toInt(), (unit * 0.5f).toInt(), (unit * 0.4f).toInt(), (unit * 0.5f).toInt())
        if (i == lines.length() - 1) setBackgroundColor(Color.argb(14, 255, 255, 255))
      }
      val info = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
      info.addView(text(line.optString("name"), 1.05f, bold = true, single = true))
      val detail = line.optString("detail")
      if (detail.isNotBlank() && detail != "null") info.addView(text(detail, 0.75f, color = FAINT, single = true))
      info.addView(text(line.optString("qty"), 0.85f, color = MUTED))
      item.addView(info, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
      item.addView(text(line.optString("amount"), 1.05f, bold = true))
      list.addView(item)
    }
    val scroll = ScrollView(context).apply { addView(list) }
    left.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    // Luôn thấy dòng vừa thêm.
    scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }

    val right = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.BOTTOM
      setPadding(pad(), pad(), pad(), pad())
      setBackgroundColor(Color.argb(10, 255, 255, 255))
    }
    val customer = cart.optString("customer")
    if (customer.isNotBlank() && customer != "null") {
      right.addView(text(customer, 1f).apply { setPadding(0, 0, 0, (unit * 0.6f).toInt()) })
    }
    val totals = cart.optJSONArray("totals") ?: JSONArray()
    for (i in 0 until totals.length()) {
      val t = totals.optJSONObject(i) ?: continue
      val strong = t.optBoolean("strong")
      val r = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, (unit * 0.2f).toInt(), 0, (unit * 0.2f).toInt())
      }
      r.addView(text(t.optString("label"), if (strong) 1.2f else 0.9f, color = if (strong) Color.WHITE else MUTED, bold = strong),
        LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
      r.addView(text(t.optString("value"), if (strong) 2.1f else 0.9f, bold = strong))
      right.addView(r)
    }

    if (landscape) {
      row.addView(left, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1.4f))
      row.addView(right, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
    } else {
      row.addView(left, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.5f))
      row.addView(right, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
    root.addView(row, matchParent())
  }

  // ── QR chuyển khoản ────────────────────────────────────────────────────────

  private fun renderQr(state: JSONObject) {
    val qr = state.optJSONObject("qr") ?: return renderAds(state)
    val landscape = context.resources.displayMetrics.let { it.widthPixels > it.heightPixels }
    val row = LinearLayout(context).apply {
      orientation = if (landscape) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(pad(), pad(), pad(), pad())
    }
    val size = (minOf(context.resources.displayMetrics.widthPixels, context.resources.displayMetrics.heightPixels) * 0.72f).toInt()
    val frame = FrameLayout(context).apply {
      background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = unit * 0.6f }
      setPadding((unit * 0.5f).toInt(), (unit * 0.5f).toInt(), (unit * 0.5f).toInt(), (unit * 0.5f).toInt())
    }
    val image = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
    frame.addView(image, matchParent())
    ImageLoader.load(qr.optString("imageUrl")) { bitmap -> if (bitmap != null) image.setImageBitmap(bitmap) }
    row.addView(frame, LinearLayout.LayoutParams(size, size))

    val info = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(if (landscape) pad() * 2 else 0, if (landscape) 0 else pad(), 0, 0)
    }
    info.addView(text(qr.optString("title").ifBlank { "Quét mã để thanh toán" }, 1.4f, bold = true))
    info.addView(text(qr.optString("amount"), 2.8f, bold = true))
    val extra = qr.optJSONArray("lines") ?: JSONArray()
    for (i in 0 until extra.length()) info.addView(text(extra.optString(i), 0.95f, color = MUTED))
    row.addView(info)
    root.addView(row, matchParent())
  }

  // ── Đã thanh toán ──────────────────────────────────────────────────────────

  private fun renderPaid(state: JSONObject) {
    val paid = state.optJSONObject("paid")
    val box = column(Gravity.CENTER)
    val check = text("✓", 3f, bold = true, center = true).apply {
      val d = (unit * 4.5f).toInt()
      layoutParams = LinearLayout.LayoutParams(d, d).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = (unit * 0.8f).toInt() }
      gravity = Gravity.CENTER
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(SUCCESS) }
    }
    box.addView(check)
    box.addView(text(paid?.optString("title").takeUnless { it.isNullOrBlank() } ?: "Cảm ơn quý khách!", 2.4f, bold = true, center = true))
    val amount = paid?.optString("amount")
    if (!amount.isNullOrBlank()) box.addView(text(amount, 1.2f, color = MUTED, center = true))
    val store = state.optString("storeName")
    if (store.isNotBlank() && store != "null") box.addView(text("$store hẹn gặp lại", 0.9f, color = FAINT, center = true).apply { setPadding(0, (unit * 0.8f).toInt(), 0, 0) })
    root.addView(box, matchParent())
  }

  // ── Tiện ích dựng view ─────────────────────────────────────────────────────

  private fun pad() = (unit * 1.2f).toInt()

  private fun matchParent() = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

  private fun column(gravity: Int) = LinearLayout(context).apply {
    orientation = LinearLayout.VERTICAL
    this.gravity = gravity
    setPadding(pad(), pad(), pad(), pad())
  }

  private fun text(value: String, scale: Float, color: Int = Color.WHITE, bold: Boolean = false, center: Boolean = false, single: Boolean = false) =
    TextView(context).apply {
      text = value
      setTextColor(color)
      setTextSize(TypedValue.COMPLEX_UNIT_PX, unit * scale)
      if (bold) typeface = Typeface.DEFAULT_BOLD
      if (center) gravity = Gravity.CENTER
      if (single) {
        maxLines = 1
        ellipsize = android.text.TextUtils.TruncateAt.END
      }
    }

  companion object {
    private val BG = Color.rgb(11, 15, 20)
    private val MUTED = Color.rgb(170, 178, 189)
    private val FAINT = Color.rgb(120, 128, 140)
    private val SUCCESS = Color.rgb(34, 197, 94)
  }
}

/** Tải ảnh (http(s) hoặc data:image;base64) ở luồng nền, nhớ đệm theo URL. */
internal object ImageLoader {
  private val executor = Executors.newFixedThreadPool(2)
  private val main = Handler(Looper.getMainLooper())
  private val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount
  }

  fun load(url: String, done: (Bitmap?) -> Unit) {
    if (url.isBlank()) return done(null)
    cache.get(url)?.let { return done(it) }
    executor.execute {
      val bitmap = try {
        if (url.startsWith("data:")) {
          val bytes = Base64.decode(url.substringAfter(","), Base64.DEFAULT)
          BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } else {
          val conn = URL(url).openConnection() as HttpURLConnection
          conn.connectTimeout = 10_000
          conn.readTimeout = 20_000
          conn.inputStream.use { BitmapFactory.decodeStream(it) }
        }
      } catch (_: Throwable) {
        null
      }
      if (bitmap != null) cache.put(url, bitmap)
      main.post { done(bitmap) }
    }
  }
}
