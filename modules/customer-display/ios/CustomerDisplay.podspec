Pod::Spec.new do |s|
  s.name           = 'CustomerDisplay'
  s.version        = '0.1.0'
  s.summary        = 'Customer-facing display on an external screen (Spark Store counter)'
  s.description    = 'Renders ads, cart, payment QR and thank-you screens on an external display (iPad + HDMI/USB-C monitor).'
  s.license        = 'UNLICENSED'
  s.author         = 'Spark Dev'
  s.homepage       = 'https://devbyspark.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,swift}"
end
