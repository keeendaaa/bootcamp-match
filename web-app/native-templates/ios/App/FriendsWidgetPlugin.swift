import Foundation
import Capacitor
import WidgetKit

@objc(FriendsWidgetPlugin)
public class FriendsWidgetPlugin: CAPPlugin {
  private let storageKey = "match_friends_widget_snapshot"
  private let appGroupId = "group.com.bootcamp.match"

  @objc func publishSnapshot(_ call: CAPPluginCall) {
    guard let snapshot = call.getObject("snapshot") else {
      call.reject("snapshot payload is required")
      return
    }

    do {
      let data = try JSONSerialization.data(withJSONObject: snapshot, options: [])
      guard let json = String(data: data, encoding: .utf8) else {
        call.reject("snapshot payload is not valid UTF-8")
        return
      }

      let defaults = UserDefaults(suiteName: appGroupId) ?? UserDefaults.standard
      defaults.set(json, forKey: storageKey)
      defaults.set(Date().timeIntervalSince1970, forKey: "\(storageKey)_updated_at")

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }

      call.resolve()
    } catch {
      call.reject("failed to serialize widget snapshot", error.localizedDescription, error)
    }
  }
}
