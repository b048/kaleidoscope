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
    # 白い背景画像を作成
    white_bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    # 透過部分を考慮して合成
    white_bg.paste(img, (0, 0), img)
    # PDFに埋め込むためにRGBに変換して返す
    return white_bg.convert("RGB")

def generate_tight_qrcode_pdf(image_path, target_count=None, target_size_mm=None, print_margin_mm=5):
    """
    透過を白背景にし、プリンタ余白を考慮した上でQRコードを隙間なく敷き詰める。
    切り取り線は境界上に非常に細く描画する。
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"画像が見つかりません: {image_path}")

    if target_count is None and target_size_mm is None:
        raise ValueError("個数(target_count)か長さ(target_size_mm)のどちらかを指定してください。")

    # 画像の透過を白背景に変換
    processed_img = convert_transparent_to_white(image_path)
    img_reader = ImageReader(processed_img)

    # A4のサイズ (ミリメートル)
    A4_WIDTH_MM = 210.0
    A4_HEIGHT_MM = 297.0
    
    # 余白(印字不可領域)を引いた、実際に配置できる有効エリア
    effective_w = A4_WIDTH_MM - (print_margin_mm * 2)
    effective_h = A4_HEIGHT_MM - (print_margin_mm * 2)

    best_size = 0
    best_cols = 1
    best_rows = 1
    final_count = 0

    if target_size_mm is not None:
        # 【モードB: サイズ(長さ)が指定された場合】
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
        # 【モードA: 個数のみが指定された場合（サイズを最大化）】
        final_count = target_count
        
        # 縦向きベースの計算
        for cols in range(1, final_count + 1):
            rows = math.ceil(final_count / cols)
            size = min(effective_w / cols, effective_h / rows)
            if size > best_size:
                best_size = size
                best_cols = cols
                best_rows = rows

        # 横向きベースの計算（縦横を逆にしてより効率的にならないかチェック）
        for cols in range(1, final_count + 1):
            rows = math.ceil(final_count / cols)
            size = min(effective_h / cols, effective_w / rows)
            if size > best_size:
                best_size = size
                best_cols = rows
                best_rows = cols

    # 出力ファイル名の生成
    output_pdf = f"QR_{final_count}個_{best_size:.1f}mm_プリンタ余白{print_margin_mm}mm.pdf"
    c = canvas.Canvas(output_pdf, pagesize=A4)
    
    # 隙間なく並べた時の全体の幅と高さ
    total_w = best_cols * best_size
    total_h = best_rows * best_size
    
    # 全体をA4用紙の中央に配置するためのオフセット
    offset_x = (A4_WIDTH_MM - total_w) / 2.0
    offset_y = (A4_HEIGHT_MM - total_h) / 2.0

    # ==========================
    # 切り取り線の描画（QRコードの境界上のみ、用紙の端から端まで引く）
    # ==========================
    c.setStrokeColorRGB(0.6, 0.6, 0.6)  # やや濃いグレーで視認性を確保
    c.setLineWidth(0.2)                 # 【変更点】非常に細い線 (約0.07mm)

    # 縦線を引く (各列の間の境界線)
    for col in range(1, best_cols):
        x = (offset_x + col * best_size) * mm
        c.line(x, 0, x, A4_HEIGHT_MM * mm)
    
    # 横線を引く (各行の間の境界線)
    for row in range(1, best_rows):
        y = (offset_y + row * best_size) * mm
        c.line(0, y, A4_WIDTH_MM * mm, y)

    # ==========================
    # QRコードの描画
    # ==========================
    count = 0
    for row in range(best_rows):
        for col in range(best_cols):
            if count >= final_count:
                break
            
            # 各QRコードの左下座標
            qr_x = (offset_x + col * best_size) * mm
            qr_y = (offset_y + (best_rows - 1 - row) * best_size) * mm
            qr_size_pt = best_size * mm
            
            # 背景を白くした画像を配置
            c.drawImage(img_reader, qr_x, qr_y, width=qr_size_pt, height=qr_size_pt)
            count += 1

    c.save()
    return output_pdf, final_count, best_size


# ==========================================
# 実行例
# ==========================================
if __name__ == "__main__":
    TARGET_IMAGE = "your_qrcode.png"  # あなたのQRコードの画像名
    MARGIN = 5                        # 物理プリンタの印字不可領域(mm)

    try:

        result_pdf, count, size = generate_tight_qrcode_pdf(
            image_path=TARGET_IMAGE, 
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