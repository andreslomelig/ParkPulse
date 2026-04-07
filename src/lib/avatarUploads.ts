import * as ImagePicker from "expo-image-picker";
import { requireSupabaseClient } from "./supabase";
import { toTrimmedString } from "./parkingShared";

export type PickedProfileImage = {
  localUri: string;
  mimeType: string;
  fileExtension: string;
};

function normalizeFileExtension(
  localUri: string,
  mimeType: string | null | undefined
): string {
  const mimeExtension = toTrimmedString(mimeType)?.split("/")[1]?.toLowerCase();
  if (mimeExtension) {
    if (mimeExtension === "jpeg") return "jpg";
    return mimeExtension;
  }

  const uriMatch = localUri.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  if (uriMatch?.[1]) {
    return uriMatch[1] === "jpeg" ? "jpg" : uriMatch[1];
  }

  return "jpg";
}

export async function pickProfileAvatarImage(): Promise<PickedProfileImage | null> {
  const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissionResult.granted) {
    throw new Error("Debes permitir acceso a tus fotos para cambiar tu perfil.");
  }

  const pickerResult = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.75,
  });

  if (pickerResult.canceled) {
    return null;
  }

  const selectedAsset = pickerResult.assets?.[0];
  const localUri = toTrimmedString(selectedAsset?.uri);

  if (!localUri) {
    throw new Error("No se pudo leer la imagen seleccionada.");
  }

  const mimeType = toTrimmedString(selectedAsset?.mimeType) ?? "image/jpeg";

  return {
    localUri,
    mimeType,
    fileExtension: normalizeFileExtension(localUri, mimeType),
  };
}

export async function uploadProfileAvatar(
  pickedImage: PickedProfileImage
): Promise<string> {
  const client = requireSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const { data: authData, error: authError } = await client.auth.getUser();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (authError) {
    throw new Error(authError.message);
  }

  const userId = toTrimmedString(authData.user?.id);
  if (!userId) {
    throw new Error("Debes iniciar sesion para subir una foto de perfil.");
  }

  const response = await fetch(pickedImage.localUri);
  if (!response.ok) {
    throw new Error("No se pudo leer la imagen seleccionada para subirla.");
  }

  const fileBuffer = await response.arrayBuffer();
  const filePath = `${userId}/avatar.${pickedImage.fileExtension}`;
  console.log("avatar upload debug:", {
    hasSession: Boolean(sessionData.session?.access_token),
    userId,
    filePath,
    mimeType: pickedImage.mimeType,
  });

  const { error: uploadError } = await client.storage.from("avatars").upload(filePath, fileBuffer, {
    contentType: pickedImage.mimeType,
    upsert: true,
  });

  if (uploadError) {
    console.error("avatar upload error:", uploadError);
    throw new Error(uploadError.message);
  }

  const { data } = client.storage.from("avatars").getPublicUrl(filePath);
  const publicUrl = toTrimmedString(data.publicUrl);

  if (!publicUrl) {
    throw new Error("No se pudo obtener la URL publica del avatar.");
  }

  return publicUrl;
}
