import type { ConfigContext, ExpoConfig } from "expo/config";

const kakaoKey = process.env.KAKAO_NATIVE_APP_KEY ?? "";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "FINE",
  slug: "fine",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "fine",
  userInterfaceStyle: "automatic",
  ios: {
    // TODO(spec): 번들 ID는 스토어 등록 시 확정 (§15 앱 심사 대비)
    bundleIdentifier: "com.fineapp.fine",
    usesAppleSignIn: true,
    icon: "./assets/expo.icon",
    infoPlist: {
      NSCameraUsageDescription:
        "습관 인증 사진을 촬영하기 위해 카메라 접근이 필요해요.",
    },
  },
  android: {
    package: "com.fineapp.fine",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: ([
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "습관 인증 사진을 촬영하기 위해 카메라 접근이 필요해요.",
      },
    ],
    "expo-notifications",
    "expo-apple-authentication",
    "@sentry/react-native",
    // 카카오 로그인은 dev build에서만 활성화 (§2). 키가 없으면 플러그인 자체를 제외한다.
    ...(kakaoKey
      ? [["@react-native-seoul/kakao-login", { kakaoAppKey: kakaoKey }]]
      : []),
  ] as (string | [string, Record<string, unknown>])[]),
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
