import os
from PIL import Image, ImageDraw
import numpy as np

SOURCE_IMAGE = r"C:\Users\Gabriel Eduardo\.gemini\antigravity-ide\brain\52334629-2372-4eac-a351-e8e741d5505a\.user_uploaded\media_1791205637044.png"
PROJECT_DIR = r"c:\Users\Gabriel Eduardo\Documents\elp\ObraFlowAndroid"
ASSETS_DIR = os.path.join(PROJECT_DIR, "assets")
RES_DIR = os.path.join(PROJECT_DIR, "android", "app", "src", "main", "res")

def get_transparent_logo(img_path):
    img = Image.open(img_path).convert('RGB')
    arr = np.array(img).astype(np.float64)
    # Darkness factor
    d = 255.0 - np.min(arr, axis=2)
    # Noise threshold: d < 30 is background
    alpha = np.clip((d - 30.0) / 30.0, 0.0, 1.0)
    out = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
    mask = alpha > 0.0
    out[mask, :3] = np.clip((arr[mask] - 255.0 * (1.0 - alpha[mask, None])) / np.maximum(alpha[mask, None], 0.01), 0, 255).astype(np.uint8)
    out[:, :, 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(out)

def generate():
    raw_img = Image.open(SOURCE_IMAGE).convert("RGBA")
    raw_img.save(os.path.join(ASSETS_DIR, "logo.png"))

    transparent_full = get_transparent_logo(SOURCE_IMAGE)
    transparent_full.save(os.path.join(ASSETS_DIR, "logo-transparent.png"))

    # Crop bounds based on alpha
    alpha_arr = np.array(transparent_full)[:, :, 3]
    y_idx, x_idx = np.where(alpha_arr > 10)
    min_x, max_x = x_idx.min(), x_idx.max()
    min_y, max_y = y_idx.min(), y_idx.max()
    print(f"Content bbox: ({min_x}, {min_y}) to ({max_x}, {max_y})")

    pad = 4
    crop_x0 = max(0, min_x - pad)
    crop_y0 = max(0, min_y - pad)
    crop_x1 = min(transparent_full.width, max_x + 1 + pad)
    crop_y1 = min(transparent_full.height, max_y + 1 + pad)

    cropped_t = transparent_full.crop((crop_x0, crop_y0, crop_x1, crop_y1))

    # 1. assets/icon.png (1024x1024) - white background with centered ELP logo
    icon_1024 = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
    target_w = 750
    ratio = target_w / float(cropped_t.width)
    target_h = int(cropped_t.height * ratio)
    res_icon = cropped_t.resize((target_w, target_h), Image.Resampling.LANCZOS)
    pos_x = (1024 - target_w) // 2
    pos_y = (1024 - target_h) // 2
    icon_1024.paste(res_icon, (pos_x, pos_y), res_icon)
    icon_1024.save(os.path.join(ASSETS_DIR, "icon.png"), "PNG")
    print("Saved assets/icon.png (1024x1024)")

    # 2. assets/android-icon-foreground.png (512x512)
    # Android adaptive icon safe zone is inner 66% (diameter ~330px)
    fg_512 = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    target_fg_w = 330
    fg_ratio = target_fg_w / float(cropped_t.width)
    target_fg_h = int(cropped_t.height * fg_ratio)
    res_fg = cropped_t.resize((target_fg_w, target_fg_h), Image.Resampling.LANCZOS)
    fg_x = (512 - target_fg_w) // 2
    fg_y = (512 - target_fg_h) // 2
    fg_512.paste(res_fg, (fg_x, fg_y), res_fg)
    fg_512.save(os.path.join(ASSETS_DIR, "android-icon-foreground.png"), "PNG")
    print("Saved assets/android-icon-foreground.png (512x512)")

    # 3. assets/splash-icon.png (1024x1024)
    splash_1024 = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    splash_w = 540
    s_ratio = splash_w / float(cropped_t.width)
    splash_h = int(cropped_t.height * s_ratio)
    res_splash = cropped_t.resize((splash_w, splash_h), Image.Resampling.LANCZOS)
    s_x = (1024 - splash_w) // 2
    s_y = (1024 - splash_h) // 2
    splash_1024.paste(res_splash, (s_x, s_y), res_splash)
    splash_1024.save(os.path.join(ASSETS_DIR, "splash-icon.png"), "PNG")
    print("Saved assets/splash-icon.png (1024x1024)")

    # 4. assets/favicon.png (48x48)
    fav_48 = Image.new("RGBA", (48, 48), (255, 255, 255, 255))
    fav_w = 40
    f_ratio = fav_w / float(cropped_t.width)
    fav_h = int(cropped_t.height * f_ratio)
    res_fav = cropped_t.resize((fav_w, fav_h), Image.Resampling.LANCZOS)
    fav_x = (48 - fav_w) // 2
    fav_y = (48 - fav_h) // 2
    fav_48.paste(res_fav, (fav_x, fav_y), res_fav)
    fav_48.save(os.path.join(ASSETS_DIR, "favicon.png"), "PNG")
    print("Saved assets/favicon.png (48x48)")

    # 5. Android native mipmaps
    densities = {
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }

    for folder, (launcher_sz, fg_sz) in densities.items():
        folder_path = os.path.join(RES_DIR, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        # ic_launcher.webp (launcher_sz x launcher_sz)
        launcher_img = Image.new("RGBA", (launcher_sz, launcher_sz), (255, 255, 255, 255))
        lw = int(launcher_sz * 0.76)
        l_ratio = lw / float(cropped_t.width)
        lh = int(cropped_t.height * l_ratio)
        res_l = cropped_t.resize((lw, lh), Image.Resampling.LANCZOS)
        lx = (launcher_sz - lw) // 2
        ly = (launcher_sz - lh) // 2
        launcher_img.paste(res_l, (lx, ly), res_l)
        launcher_img.save(os.path.join(folder_path, "ic_launcher.webp"), "WEBP")

        # ic_launcher_round.webp (circle mask)
        circle_img = launcher_img.copy()
        mask = Image.new("L", (launcher_sz, launcher_sz), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, launcher_sz - 1, launcher_sz - 1), fill=255)
        round_out = Image.new("RGBA", (launcher_sz, launcher_sz), (0, 0, 0, 0))
        round_out.paste(circle_img, (0, 0), mask)
        round_out.save(os.path.join(folder_path, "ic_launcher_round.webp"), "WEBP")

        # ic_launcher_foreground.webp (fg_sz x fg_sz)
        fg_img = Image.new("RGBA", (fg_sz, fg_sz), (0, 0, 0, 0))
        fw = int(fg_sz * 0.60)
        f_ratio = fw / float(cropped_t.width)
        fh = int(cropped_t.height * f_ratio)
        res_fg = cropped_t.resize((fw, fh), Image.Resampling.LANCZOS)
        fx = (fg_sz - fw) // 2
        fy = (fg_sz - fh) // 2
        fg_img.paste(res_fg, (fx, fy), res_fg)
        fg_img.save(os.path.join(folder_path, "ic_launcher_foreground.webp"), "WEBP")
        print(f"Generated icons for {folder}")

    # Remove temporary test file
    test_path = os.path.join(ASSETS_DIR, "clean_alpha.png")
    if os.path.exists(test_path):
        os.remove(test_path)

    print("All icons successfully generated with crystal clarity!")

if __name__ == "__main__":
    generate()
