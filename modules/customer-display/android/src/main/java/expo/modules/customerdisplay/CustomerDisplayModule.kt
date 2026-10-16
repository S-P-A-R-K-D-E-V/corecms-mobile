package expo.modules.customerdisplay

import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Màn hình khách trên màn phụ của máy quầy (POS Android 2 màn như Sunmi / iMin, tablet cắm màn hình ngoài): dùng
 * Presentation của Android vẽ nội dung lên màn hình loại "presentation" đầu tiên. JS gửi cả trạng thái (JSON đã định
 * dạng sẵn chữ / số tiền) mỗi lần đổi; module giữ bản cuối để vẽ lại khi màn phụ cắm lại hoặc app quay lại.
 */
class CustomerDisplayModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var presentation: CustomerPresentation? = null
  private var lastState: String? = null
  private var keepAwake = false
  private var displayListener: DisplayManager.DisplayListener? = null

  private val context: Context?
    get() = appContext.reactContext

  private fun displayManager(): DisplayManager? =
    context?.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager

  private fun findDisplay(): Display? =
    displayManager()?.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)?.firstOrNull()

  private fun dismiss() {
    try {
      presentation?.dismiss()
    } catch (_: Throwable) {
    }
    presentation = null
  }

  /** Vẽ trạng thái cuối lên màn phụ (tạo Presentation nếu chưa có / màn phụ đổi). Chạy trên luồng chính. */
  private fun renderLast() {
    val state = lastState ?: return dismiss()
    val activity = appContext.currentActivity ?: return
    val display = findDisplay() ?: return dismiss()
    var current = presentation
    if (current == null || current.display.displayId != display.displayId || !current.isShowing) {
      dismiss()
      current = try {
        CustomerPresentation(activity, display).also { it.show() }
      } catch (_: Throwable) {
        // Activity đang đóng / màn phụ vừa rút ra — lần cập nhật sau thử lại.
        null
      }
      presentation = current
    }
    current?.render(state)
  }

  private fun applyKeepAwake() {
    val window = appContext.currentActivity?.window ?: return
    if (keepAwake) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  override fun definition() = ModuleDefinition {
    Name("CustomerDisplay")

    Events("onDisplayChange")

    OnCreate {
      val listener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) = changed()
        override fun onDisplayRemoved(displayId: Int) = changed()
        override fun onDisplayChanged(displayId: Int) {}

        private fun changed() {
          val available = findDisplay() != null
          sendEvent("onDisplayChange", mapOf("available" to available))
          main.post { if (available) renderLast() else dismiss() }
        }
      }
      displayListener = listener
      displayManager()?.registerDisplayListener(listener, main)
    }

    OnDestroy {
      displayListener?.let { displayManager()?.unregisterDisplayListener(it) }
      displayListener = null
      main.post { dismiss() }
    }

    OnActivityEntersForeground {
      main.post {
        applyKeepAwake()
        renderLast()
      }
    }

    OnActivityDestroys {
      main.post { dismiss() }
    }

    /** Có màn phụ (loại presentation) đang cắm không. */
    Function("isAvailable") {
      findDisplay() != null
    }

    /** Vẽ trạng thái (JSON, xem src/services/customer-display.ts). */
    Function("render") { state: String ->
      lastState = state
      main.post { renderLast() }
    }

    /** Tắt màn phụ (về màn trống của hệ thống). */
    Function("hide") {
      lastState = null
      main.post { dismiss() }
    }

    /** Giữ màn hình chính sáng (máy quầy mở cả ngày). */
    Function("setKeepAwake") { on: Boolean ->
      keepAwake = on
      main.post { applyKeepAwake() }
    }
  }
}
