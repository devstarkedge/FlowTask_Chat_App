import ReplayKit
import CoreImage
import ImageIO
import Darwin

// App Group local socket matches react-native-webrtc's ScreenCapturer framing.
// One frame is encoded at a time; slow receivers cannot grow an unbounded queue.
final class SampleHandler: RPBroadcastSampleHandler {
  private let queue = DispatchQueue(label: "taskchat.broadcast", qos: .userInitiated)
  private let lock = NSLock()
  private let imageContext = CIContext(options: [.cacheIntermediates: false])
  private var busy = false
  private var active = false
  private var socketFD: Int32 = -1
  private var lastFrame = 0.0
  private var announced = false
  private var finished = false
  private var group = ""
  private var eventPrefix = ""

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    guard let identifier = Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String,
          FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier) != nil else {
      fail("TaskChat screen-sharing App Group is unavailable. Reinstall the signed build.")
      return
    }
    group = identifier
    eventPrefix = identifier + ".huddle."
    lock.lock(); active = true; lock.unlock()
    CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque(), { _, observer, _, _, _ in
      guard let observer = observer else { return }
      let handler = Unmanaged<SampleHandler>.fromOpaque(observer).takeUnretainedValue()
      handler.fail("Screen sharing stopped.")
    }, (eventPrefix + "stop") as CFString, nil, .deliverImmediately)
  }

  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    guard sampleBufferType == .video else { return }
    let time = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
    lock.lock()
    guard active && !busy && time - lastFrame >= 1.0 / 15.0 else { lock.unlock(); return }
    busy = true; lastFrame = time; lock.unlock()
    queue.async { [weak self] in
      guard let self = self else { return }
      defer { self.lock.lock(); self.busy = false; self.lock.unlock() }
      autoreleasepool { self.sendFrame(sampleBuffer) }
    }
  }

  private func openSocket() -> Bool {
    if socketFD >= 0 { return true }
    guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("rtc_SSFD") else { return false }
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    let bytes = Array(url.path.utf8CString)
    guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { return false }
    _ = withUnsafeMutableBytes(of: &address.sun_path) { buffer in bytes.withUnsafeBytes { source in memcpy(buffer.baseAddress!, source.baseAddress!, source.count) } }
    for _ in 0..<10 {
      let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
      guard fd >= 0 else { return false }
      var noSignal: Int32 = 1
      setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
      var timeout = timeval(tv_sec: 2, tv_usec: 0)
      setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
      let result = withUnsafePointer(to: &address) { pointer in pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) } }
      if result == 0 { socketFD = fd; return true }
      Darwin.close(fd); usleep(200000)
    }
    return false
  }

  private func sendFrame(_ sample: CMSampleBuffer) {
    lock.lock(); let running = active; lock.unlock()
    guard running, let buffer = CMSampleBufferGetImageBuffer(sample) else { return }
    guard openSocket() else { fail("TaskChat could not connect to the Huddle. Reopen TaskChat and share again."); return }
    let image = CIImage(cvPixelBuffer: buffer)
    let quality = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
    guard var jpeg = imageContext.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(), options: [quality: 0.9]) else { return }
    // The native receiver initially reads 10 KiB before learning the body size.
    // A legal JPEG comment keeps tiny/blank frames above that boundary, so a
    // coalesced socket read cannot accidentally consume the next frame header.
    if jpeg.count < 12288 {
      let padding = max(4, 12288 - jpeg.count)
      let length = padding - 2
      var comment = Data([0xff, 0xfe, UInt8(length >> 8), UInt8(length & 0xff)])
      comment.append(Data(repeating: 0, count: padding - 4))
      jpeg.insert(contentsOf: comment, at: 2)
    }
    let orientation = (CMGetAttachment(sample, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber)?.intValue ?? 1
    let header = "HTTP/1.1 200 OK\r\nContent-Length: \(jpeg.count)\r\nBuffer-Width: \(CVPixelBufferGetWidth(buffer))\r\nBuffer-Height: \(CVPixelBufferGetHeight(buffer))\r\nBuffer-Orientation: \(orientation)\r\n\r\n"
    var packet = Data(header.utf8); packet.append(jpeg)
    let sent = packet.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) -> Bool in
      var offset = 0
      while offset < bytes.count {
        let written = Darwin.send(socketFD, bytes.baseAddress!.advanced(by: offset), bytes.count - offset, 0)
        if written < 0 && errno == EINTR { continue }
        if written <= 0 { return false }
        offset += written
      }
      return true
    }
    if !sent { fail("The Huddle screen share has ended."); return }
    if !announced { announced = true; notify("started") }
  }

  private func notify(_ event: String) {
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName((eventPrefix + event) as CFString), nil, nil, true)
  }
  private func fail(_ reason: String) {
    lock.lock(); let alreadyFinished = finished; finished = true; active = false; lock.unlock()
    if !alreadyFinished { finishBroadcastWithError(NSError(domain: "TaskChatScreenShare", code: 1, userInfo: [NSLocalizedDescriptionKey: reason])) }
  }
  override func broadcastPaused() { lock.lock(); active = false; lock.unlock() }
  override func broadcastResumed() { lock.lock(); active = !finished; lock.unlock() }
  override func broadcastFinished() {
    lock.lock(); active = false; finished = true; lock.unlock()
    CFNotificationCenterRemoveEveryObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
    notify("ended")
    queue.async { [weak self] in guard let self = self else { return }; if self.socketFD >= 0 { Darwin.close(self.socketFD); self.socketFD = -1 } }
  }
  deinit {
    CFNotificationCenterRemoveEveryObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
    if socketFD >= 0 { Darwin.close(socketFD) }
  }
}
