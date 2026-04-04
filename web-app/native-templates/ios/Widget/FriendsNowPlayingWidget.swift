import WidgetKit
import SwiftUI

private let storageKey = "match_friends_widget_snapshot"
private let appGroupId = "group.com.bootcamp.match"

struct WidgetTrackSnapshot: Decodable {
  let id: Int
  let title: String
  let artist: String
  let cover: String
  let duration: String
  let streamUrl: String?
}

struct WidgetFriendSnapshot: Decodable {
  let id: Int
  let name: String
  let username: String
  let avatar: String
  let isListening: Bool
  let lastActive: String?
  let currentSong: WidgetTrackSnapshot?
}

struct FeaturedWidgetItem: Decodable {
  let friendId: Int
  let friendName: String
  let friendAvatar: String
  let trackId: Int
  let title: String
  let artist: String
  let cover: String
  let cta: String
  let deeplink: String
  let webUrl: String
}

struct FriendsWidgetSnapshot: Decodable {
  let appName: String
  let currentUserName: String?
  let updatedAt: String
  let friends: [WidgetFriendSnapshot]
  let featured: FeaturedWidgetItem?

  static let empty = FriendsWidgetSnapshot(
    appName: "Match",
    currentUserName: nil,
    updatedAt: "",
    friends: [],
    featured: nil
  )
}

struct FriendsWidgetEntry: TimelineEntry {
  let date: Date
  let snapshot: FriendsWidgetSnapshot
}

struct FriendsWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> FriendsWidgetEntry {
    FriendsWidgetEntry(date: Date(), snapshot: FriendsWidgetSnapshot.empty)
  }

  func getSnapshot(in context: Context, completion: @escaping (FriendsWidgetEntry) -> Void) {
    completion(FriendsWidgetEntry(date: Date(), snapshot: loadSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<FriendsWidgetEntry>) -> Void) {
    let entry = FriendsWidgetEntry(date: Date(), snapshot: loadSnapshot())
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }

  private func loadSnapshot() -> FriendsWidgetSnapshot {
    let defaults = UserDefaults(suiteName: appGroupId) ?? UserDefaults.standard
    guard let raw = defaults.string(forKey: storageKey),
          let data = raw.data(using: .utf8),
          let snapshot = try? JSONDecoder().decode(FriendsWidgetSnapshot.self, from: data) else {
      return .empty
    }
    return snapshot
  }
}

struct FriendsWidgetRemoteImage: View {
  let url: String

  var body: some View {
    if let imageUrl = URL(string: url) {
      AsyncImage(url: imageUrl) { phase in
        switch phase {
        case .success(let image):
          image
            .resizable()
            .scaledToFill()
        default:
          placeholder
        }
      }
    } else {
      placeholder
    }
  }

  private var placeholder: some View {
    LinearGradient(
      colors: [Color(red: 0.59, green: 0.54, blue: 0.93), Color(red: 1.0, green: 0.58, blue: 0.18)],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }
}

struct FriendsNowPlayingWidgetEntryView: View {
  var entry: FriendsWidgetProvider.Entry

  var body: some View {
    if let featured = entry.snapshot.featured,
       let deeplink = URL(string: featured.deeplink) {
      Link(destination: deeplink) {
        content(featured: featured)
      }
      .widgetURL(deeplink)
    } else {
      emptyState
    }
  }

  private func content(featured: FeaturedWidgetItem) -> some View {
    ZStack {
      LinearGradient(
        colors: [Color(red: 0.69, green: 0.61, blue: 0.95), Color(red: 1.0, green: 0.58, blue: 0.18)],
        startPoint: .leading,
        endPoint: .trailing
      )

      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .top, spacing: 12) {
          FriendsWidgetRemoteImage(url: featured.cover)
            .frame(width: 74, height: 74)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

          VStack(alignment: .leading, spacing: 6) {
            Text("МЭТЧ")
              .font(.system(size: 16, weight: .black))
              .padding(.horizontal, 14)
              .padding(.vertical, 6)
              .foregroundStyle(.black)
              .background(Color.white)
              .clipShape(Capsule())

            Text(featured.title)
              .font(.system(size: 22, weight: .semibold))
              .foregroundStyle(.white)
              .lineLimit(1)

            Text(featured.artist)
              .font(.system(size: 14, weight: .medium))
              .foregroundStyle(.white.opacity(0.86))
              .lineLimit(1)

            HStack(spacing: 8) {
              FriendsWidgetRemoteImage(url: featured.friendAvatar)
                .frame(width: 26, height: 26)
                .clipShape(Circle())

              Text(featured.friendName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.92))
                .lineLimit(1)
            }
          }

          Spacer(minLength: 0)
        }

        Text(featured.cta)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(.black)
          .padding(.horizontal, 16)
          .frame(maxWidth: .infinity, minHeight: 42)
          .background(Color.white)
          .clipShape(Capsule())
      }
      .padding(18)
    }
  }

  private var emptyState: some View {
    ZStack {
      LinearGradient(
        colors: [Color(red: 0.69, green: 0.61, blue: 0.95), Color(red: 1.0, green: 0.58, blue: 0.18)],
        startPoint: .leading,
        endPoint: .trailing
      )

      VStack(alignment: .leading, spacing: 10) {
        Text("МЭТЧ")
          .font(.system(size: 16, weight: .black))
          .padding(.horizontal, 14)
          .padding(.vertical, 6)
          .foregroundStyle(.black)
          .background(Color.white)
          .clipShape(Capsule())

        Text("У друзей пока тихо")
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(.white)

        Text("Как только кто-то включит музыку, виджет покажет трек и быстрый вход в чат.")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(.white.opacity(0.86))
      }
      .padding(18)
    }
  }
}

struct FriendsNowPlayingWidget: Widget {
  let kind: String = "FriendsNowPlayingWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: FriendsWidgetProvider()) { entry in
      FriendsNowPlayingWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Что играет у друзей")
    .description("Открывает приложение на нужном треке и чате.")
    .supportedFamilies([.systemLarge])
  }
}
