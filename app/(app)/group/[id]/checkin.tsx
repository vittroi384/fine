import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSubmitCheckin } from "@/api/checkins";
import { useGroup } from "@/api/groups";
import { Button } from "@/components/Button";
import { ko } from "@/i18n/ko";
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE } from "@/lib/constants";
import { codeToMessage } from "@/lib/errors";
import { colors, spacing } from "@/lib/theme";
import { useUiStore } from "@/stores/ui";
import type { Database, Json } from "@/types/db";

type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];

interface Shot {
  uri: string;
  width: number;
  height: number;
  exif: Record<string, unknown> | null;
}

/** §15: client_exif에서 GPS·위치 필드 제거 */
function stripGps(exif: Record<string, unknown> | null): Json | null {
  if (!exif) return null;
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(exif)) {
    if (/gps|location|latitude|longitude/i.test(k)) continue;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null
    )
      out[k] = v;
  }
  return out;
}

// §7.6: 앱 내 카메라 전용 (갤러리 버튼 없음)
export default function Checkin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [shot, setShot] = useState<Shot | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const submit = useSubmitCheckin();

  const { data: group } = useGroup(id);
  const season = ((group?.seasons as SeasonRow[] | undefined) ?? []).find(
    (s) => s.status === "active",
  );

  if (!permission) return <View style={styles.wrap} />;

  if (!permission.granted) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.permTitle}>{ko.camera.permissionTitle}</Text>
        <Text style={styles.permBody}>{ko.camera.permissionBody}</Text>
        {permission.canAskAgain ? (
          <Button label={ko.common.confirm} onPress={requestPermission} />
        ) : (
          <Button
            label={ko.camera.openSettings}
            onPress={() => Linking.openSettings()}
          />
        )}
      </View>
    );
  }

  const take = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ exif: true });
    if (!photo) return;
    setShot({
      uri: photo.uri,
      width: photo.width,
      height: photo.height,
      exif: (photo.exif as Record<string, unknown> | undefined) ?? null,
    });
  };

  const upload = async () => {
    if (!shot || !season) return;
    // 장변 1280px 리사이즈 + JPEG 0.7 (§7.6)
    const landscape = shot.width >= shot.height;
    const ctx = ImageManipulator.manipulate(shot.uri);
    ctx.resize(landscape ? { width: PHOTO_MAX_EDGE } : { height: PHOTO_MAX_EDGE });
    const rendered = await ctx.renderAsync();
    const result = await rendered.saveAsync({
      compress: PHOTO_JPEG_QUALITY,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (!result.base64) {
      showToast(ko.common.fallbackError, "error");
      return;
    }
    submit.mutate(
      {
        seasonId: season.id,
        photoBase64: result.base64,
        clientExif: stripGps(shot.exif),
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
        onError: (e) => {
          showToast(codeToMessage(e, "ALREADY_CHECKED_IN"), "error");
        },
      },
    );
  };

  return (
    <View style={styles.wrap}>
      {shot ? (
        <>
          <Image source={{ uri: shot.uri }} style={styles.preview} />
          <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
            <Button
              label={ko.camera.retake}
              variant="secondary"
              onPress={() => setShot(null)}
              style={styles.flex1}
            />
            <Button
              label={submit.isPending ? ko.camera.uploading : ko.camera.submit}
              loading={submit.isPending}
              onPress={upload}
              style={styles.flex1}
            />
          </View>
        </>
      ) : (
        <>
          <CameraView ref={cameraRef} style={styles.camera} facing={facing} />
          <View style={[styles.shutterRow, { paddingBottom: insets.bottom + spacing.lg }]}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.controlIcon}>✕</Text>
            </Pressable>
            <Pressable onPress={take} style={styles.shutter} />
            <Pressable
              onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
              hitSlop={12}
            >
              <Text style={styles.controlIcon}>🔄</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  permTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  permBody: { fontSize: 14, color: colors.textSub, textAlign: "center" },
  camera: { flex: 1 },
  preview: { flex: 1, resizeMode: "contain" },
  shutterRow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: spacing.md,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFF",
    borderWidth: 5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  controlIcon: { fontSize: 26, color: "#FFF" },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  flex1: { flex: 1 },
});
