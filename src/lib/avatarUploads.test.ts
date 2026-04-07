import {
  pickProfileAvatarImage,
  uploadProfileAvatar,
} from "./avatarUploads";
import { requireSupabaseClient } from "./supabase";

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("./supabase", () => ({
  requireSupabaseClient: jest.fn(),
}));

describe("avatarUploads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("picks and normalizes an avatar image", async () => {
    const ImagePicker = jest.requireMock("expo-image-picker");
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///avatar.jpeg",
          mimeType: "image/jpeg",
        },
      ],
    });

    await expect(pickProfileAvatarImage()).resolves.toEqual({
      localUri: "file:///avatar.jpeg",
      mimeType: "image/jpeg",
      fileExtension: "jpg",
    });
  });

  it("returns null when the picker is canceled", async () => {
    const ImagePicker = jest.requireMock("expo-image-picker");
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    });

    await expect(pickProfileAvatarImage()).resolves.toBeNull();
  });

  it("requires gallery permission", async () => {
    const ImagePicker = jest.requireMock("expo-image-picker");
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(pickProfileAvatarImage()).rejects.toThrow(
      "Debes permitir acceso a tus fotos para cambiar tu perfil."
    );
  });

  it("uploads the selected image to the avatars bucket", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    }) as jest.Mock;

    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({
      data: {
        publicUrl:
          "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg",
      },
    });

    (requireSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      storage: {
        from: jest.fn().mockReturnValue({
          upload,
          getPublicUrl,
        }),
      },
    });

    await expect(
      uploadProfileAvatar({
        localUri: "file:///avatar.jpg",
        mimeType: "image/jpeg",
        fileExtension: "jpg",
      })
    ).resolves.toBe(
      "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg"
    );
  });
});
