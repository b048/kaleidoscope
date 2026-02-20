import math
import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from PIL import Image

def convert_transparent_to_white(image_path):
    """
    透過背景の画像を白背景に変換する関数
    """
    img = Image.open(image_path).convert("RGBA")
    white_bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    white_bg.paste(img, (0, 0), img)
    return white_bg.convert("RGB")

def draw_top_ruler(c, width_mm, height_mm):
    """
    用紙の上端に1mm単位の精密な定規を描画する関数
    """
    c.setStrokeColorRGB(0.2, 0.2, 0.2)  # 濃いグレー（黒に近い）
    c.setLineWidth(0.3)
    c.setFont("Helvetica", 5)           # 数字のフォントサイズ

    for i in range(int(width_mm) + 1):
        x = i * mm
        
        # メモリの長さを10mm, 5mm, 1mm単位で変える
        if i % 10 == 0:
            tick_len = 5 * mm
            # 10mmごとに数字を描画（左端と右端が切れないように少しずらす）
            if i != 0:
                c.drawString(x - 2*mm, (height_mm * mm) - 7.5*mm, str(i))
            else:
                c.drawString(x + 1*mm, (height_mm * mm) - 7.5*mm, str(i))
        elif i % 5 == 0:
            tick_len = 3 * mm
        else:
            tick_len = 1.5 * mm
            c.setLineWidth(0.15) # 1mmメモリはさらに細く
        
        # 上端から下に向かって線を引く
        c.line(x, height_mm * mm, x, (height_mm * mm) - tick_len)
        c.setLineWidth(0.3)      # 線の太さをリセット

def generate_tight_qrcode_pdf(image_path, target_count=None, target_size_mm=None, print_margin_mm=5):
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"画像が見つかりません: {image_path}")

    if target_count is None and target_size_mm is None:
        raise ValueError("個数(target_count)か長さ(target_size_mm)のどちらかを指定してください。")

    processed_img = convert_transparent_to_white(image_path)
    img_reader = ImageReader(processed_img)

    A4_WIDTH_MM = 210.0
    A4_HEIGHT_MM = 297.0
    
    effective_w = A4_WIDTH_MM - (print_margin_mm * 2)
    effective_h = A4_HEIGHT_MM - (print_margin_mm * 2)

    best_size = 0
    best_cols = 1
    best_rows = 1
    final_count = 0

    if target_size_mm is not None:
        best_size = target_size_mm
        max_cols = int(effective_w // best_size)
        max_rows = int(effective_h // best_size)
        
        if max_cols == 0 or max_rows == 0:
            raise ValueError(f"指定サイズ({best_size}mm)では、余白({print_margin_mm}mm)を除いたA4用紙に1つも配置できません。")

        if target_count is not None:
            final_count = target_count
            best_cols = min(max_cols, final_count)
            best_rows = math.ceil(final_count / best_cols)
            if best_rows > max_rows:
                 raise ValueError(f"指定されたサイズ({best_size}mm)では、A4用紙1枚に{target_count}個収まりません。(最大: {max_cols * max_rows}個)")
        else:
            best_cols = max_cols
            best_rows = max_rows
            final_count = best_cols * best_rows

    else:
        final_count = target_count
        for cols in range(1, final_count + 1):
            rows = math.ceil(final_count / cols)
            size = min(effective_w / cols, effective_h / rows)
            if size > best_size:
                best_size = size
                best_cols = cols
                best_rows = rows

        for cols in range(1, final_count + 1):
            rows = math.ceil(final_count / cols)
            size = min(effective_h / cols, effective_w / rows)
            if size > best_size:
                best_size = size
                best_cols = rows
                best_rows = cols

    output_pdf = f"QR_{final_count}個_{best_size:.1f}mm_プリンタ余白{print_margin_mm}mm.pdf"
    c = canvas.Canvas(output_pdf, pagesize=A4)
    
    total_w = best_cols * best_size
    total_h = best_rows * best_size
    
    offset_x = (A4_WIDTH_MM - total_w) / 2.0
    offset_y = (A4_HEIGHT_MM - total_h) / 2.0

    # ==========================
    # 1. 先にQRコードを描画する
    # ==========================
    count = 0
    for row in range(best_rows):
        for col in range(best_cols):
            if count >= final_count:
                break
            
            qr_x = (offset_x + col * best_size) * mm
            qr_y = (offset_y + (best_rows - 1 - row) * best_size) * mm
            qr_size_pt = best_size * mm
            
            c.drawImage(img_reader, qr_x, qr_y, width=qr_size_pt, height=qr_size_pt)
            count += 1

    # ==========================
    # 2. 後から切り取り線を描画する（上書きして見えるようにする）
    # ==========================
    c.setStrokeColorRGB(0.5, 0.5, 0.5)
    c.setLineWidth(0.2)

    for col in range(1, best_cols):
        x = (offset_x + col * best_size) * mm
        c.line(x, 0, x, A4_HEIGHT_MM * mm)
    
    for row in range(1, best_rows):
        y = (offset_y + row * best_size) * mm
        c.line(0, y, A4_WIDTH_MM * mm, y)

    # ==========================
    # 3. 上部の余白に定規を描画
    # ==========================
    draw_top_ruler(c, A4_WIDTH_MM, A4_HEIGHT_MM)

    c.save()
    return output_pdf, final_count, best_size


# ==========================================
# 実行例
# ==========================================
if __name__ == "__main__":
    # TARGET_IMAGE = "your_qrcode.png"  # あなたのQRコードの画像名
    TARGET_IMAGE = "Xgd_Fzk2G.png"  # あなたのQRコードの画像名
    MARGIN = 0                        # 物理プリンタの印字不可領域(mm)

    try:
        result_pdf, count, size = generate_tight_qrcode_pdf(
            image_path=TARGET_IMAGE, 
            # target_count=20,          
            # target_size_mm=None,      
            target_count=None,          
            target_size_mm=30.0,      
            print_margin_mm=MARGIN
        )

        print(f"成功: {result_pdf} を作成しました！")
        print(f"【結果】QRコード個数: {count}個 / 1辺の長さ: {size:.1f} mm / 考慮したプリンタ余白: {MARGIN} mm")
        
    except FileNotFoundError as e:
        print(e)
        print("スクリプトと同じフォルダにQRコードの画像を置いて、ファイル名を合わせてください。")
    except ValueError as e:
        print(f"エラー: {e}")