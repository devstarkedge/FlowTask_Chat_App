# Cross-platform calling

Calling uses the existing TaskChat Huddle backend, Socket.IO and WebRTC. No hosted calling API is introduced. Web and Mac use the desktop Huddle presentation; mobile uses native controls with the same join/leave, microphone, camera, hand, reactions, invitations and collaborative-notes protocol.

## Delivery to multiple devices

The server invites authorized conversation members, including offline members. A server-authenticated `huddle:user:<userId>` room reaches connected installations across workspaces. Each invitation has one ID and a 60-second expiry. Socket, browser push and mobile push reuse that ID. On answering, other connected installations silence the invitation. Joining always revalidates the active Huddle and membership.

The existing server limit remains five simultaneous sockets per account (browser tabs also count). Mobile/browser push can reach registered installations while their sockets are offline.

Background mobile delivery uses the existing Expo push registrations for each installation. It requires native notification permission and valid APNs/FCM credentials for this Expo project. Browser background delivery requires the existing Web Push registration/VAPID configuration. A successful invitation request is not proof that an OS displayed an alert. OS DND, disabled notifications, force-stop and network restrictions still apply.

## Native builds

- Deploy the changed `server` and `client` sources. Update desktop installations as well as mobile installations; old mobile binaries do not contain the new native modules. This is not an OTA-only change.
- Android: regenerate the native project with `npx expo prebuild --platform android`, then build through the existing EAS profile or Android toolchain. The app-owned foreground service keeps an active call notification and emits background heartbeats. It starts only when joining, and stops on leave/logout. Screen capture still requires the Android permission dialog.
- iPhone: build through the existing EAS iOS profile or on a Mac after native prebuild. `withHuddleBroadcast.cjs` adds the `TaskChatBroadcast` ReplayKit extension, its native event bridge and EAS extension credential declaration. The app and extension share `group.com.mohitgahlyan.chatmobilejs.huddle`. Provisioning profiles for both bundle IDs must include that App Group. The system Start Broadcast prompt requires the user's confirmation.
- Mac: build `chat-desktop(mac)` on a Mac using `npm run build:mac`. Camera, microphone and Screen Recording permissions are required when those features are used. Menus, native titlebar behavior and the app identity remain Mac-specific.

## Platform capabilities and validation limits

Desktop sharing includes presenter annotation tools and the existing screen presentation controls. Mobile receives those composited annotations. Native mobile capture currently sends screen video and the call microphone; it does not capture other applications' system sound or provide desktop-wide drawing overlays. Mac's custom picker also currently shares video/microphone without system-loopback audio. Web system-audio capture depends on the browser/source picker.

Expo Go cannot run the native calling module. Windows cannot compile or sign Mac/iOS apps. Passing JS exports, native-project generation and mocked native tests does not establish real-device audio, push delivery or ReplayKit performance; test these on signed Android/iPhone and Mac builds before release.

## Focused checks

From `chat-mobile`, run `node --test scripts/test-huddle.mjs`. From `server`, run `npm test -- huddle`. The backend network test uses a loopback Socket.IO server with three recipient devices and an unrelated user. The web/Mac Huddle tests run through their existing Vitest scripts. Production JS exports can be checked with `npx expo export --platform android --platform ios`.
