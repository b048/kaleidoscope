import math
import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm

def generate_custom_qrcode_pdf(image_path, target_count=None, target_size_mm=None, print_margin_mm=5):
    """
    画面全体（A4）を利用してQRコードを配置し、切り取り線を間にだけ引くPDFを生成する
    
    :param image_path: 入力するQRコード画像のパス
    :param target_count: 印刷したい数 (Noneの場合はサイズ指定ベースで敷き詰める)
    :param target_size_mm: QRコード1辺の長さ (Noneの場合は個数指定ベースで最大化する)
    :param print_margin_mm: プリンタの余白 (このマージン内にはQRコードが被らないように計算される)
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"画像が見つかりません: {image_path}")

    if target_count is None and target_size_mm is None:
        raise ValueError("個数(target_count)か長さ(target_size_mm)のどちらかを指定してください。")

    # A4のサイズ (ミリメートル)
    A4_WIDTH_MM = 210.0
    A4_HEIGHT_MM = 297.0
    
    best_size = 0
    best_cols = 1
    best_rows = 1
    final_count = 0

    if target_size_mm is not None:
        # 【モードB: サイズ(長さ)が指定された場合】
        best_size = target_size_mm
        
        # QRコードがマージンに被らないようにするための、1マス(セル)の最小サイズ
        min_cell_size = best_size + (print_margin_mm * 2)
        max_cols = int(A4_WIDTH_MM // min_cell_size)
        max_rows = int(A4_HEIGHT_MM // min_cell_size)
        
        if max_cols == 0 or max_rows == 0:
            raise ValueError(f"指定サイズ({best_size}mm)と余白({print_margin_mm}mm)では、A4用紙に1つも配置できません。")

        if target_count is not None:
            final_count = target_count
            best_c, best_r = 0, 0
            best_diff = float('inf')
            
            # 指定個数を満たしつつ、切り取った紙片がなるべく正方形に近くなる列・行の組み合わせを探す
            for c in range(1, final_count + 1):
                r = math.ceil(final_count / c)
                if c <= max_cols and r <= max_rows:
                    cw = A4_WIDTH_MM / c
                    ch = A4_HEIGHT_MM / r
                    diff = abs(cw - ch)
                    if diff < best_diff:
                        best_diff = diff
                        best_c, best_r = c, r
                        
            if best_c == 0:
                 raise ValueError(f"指定されたサイズ({best_size}mm)では、A4用紙1枚に{target_count}個収まりません。(最大: {max_cols * max_rows}個)")
            best_cols, best_rows = best_c, best_r
        else:
            best_cols = max_cols
            best_rows = max_rows
            final_count = best_cols * best_rows

    else:
        # 【モードA: 個数のみが指定された場合（サイズを最大化）】
        final_count = target_count
        
        # すべての列数のパターンを計算
        for cols in range(1, final_count + 1):
            rows = math.ceil(final_count / cols)
            
            # 画面全体を均等に分割した1マスのサイズ
            cw = A4_WIDTH_MM / cols
            ch = A4_HEIGHT_MM / rows
            
            # マスの中央に配置した際、用紙端の余白(マージン)に被らない最大サイズ
            size = min(cw - 2 * print_margin_mm, ch - 2 * print_margin_mm)
            
            if size > best_size:
                best_size = size
                best_cols = cols
                best_rows = rows
                
        if best_size <= 0:
            raise ValueError(f"余白({print_margin_mm}mm)が大きすぎるか、個数が多すぎて配置できません。")

    # 出力ファイル名の生成
    output_pdf = f"QR_{final_count}個_{best_size:.1f}mm_余白{print_margin_mm}mm.pdf"

    # PDFの生成
    c = canvas.Canvas(output_pdf, pagesize=A4)
    
    # 1マスの幅と高さを確定
    cw = A4_WIDTH_MM / best_cols
    ch = A4_HEIGHT_MM / best_rows

    # ==========================
    # 切り取り線（薄い直線）の描画
    # ==========================
    c.setStrokeColorRGB(0.8, 0.8, 0.8)  # 薄いグレー
    c.setLineWidth(0.5)                 # 細い線

    # 縦線を引く (間の線のみ・画面端から端まで)
    for col in range(1, best_cols):
        x = col * cw * mm
        c.line(x, 0, x, A4_HEIGHT_MM * mm)
    
    # 横線を引く (間の線のみ・画面端から端まで)
    for row in range(1, best_rows):
        y = row * ch * mm
        c.line(0, y, A4_WIDTH_MM * mm, y)

    # ==========================
    # QRコードの描画
    # ==========================
    count = 0
    for row in range(best_rows):
        for col in range(best_cols):
            if count >= final_count:
                break
            
            # 該当マスの中心座標を計算
            center_x = (col + 0.5) * cw
            center_y = A4_HEIGHT_MM - (row + 0.5) * ch
            
            # 中心からQRコードの左下座標を割り出す
            qr_x = (center_x - best_size / 2.0) * mm
            qr_y = (center_y - best_size / 2.0) * mm
            qr_size_pt = best_size * mm
            
            c.drawImage(image_path, qr_x, qr_y, width=qr_size_pt, height=qr_size_pt)
            count += 1

    c.save()
    return output_pdf, final_count, best_size


# ==========================================
# 実行例（使い方）
# ==========================================
if __name__ == "__main__":
    # TARGET_IMAGE = "C:\\Users\\isaki\\Code\\antigrabity\\kaleid\\QR\\Xgd_Fzk2G.png"  # あなたのQRコードの画像名
    TARGET_IMAGE = "C:\\Users\\isaki\\Code\\antigrabity\\kaleid\\QR\\QRcode_sp1.png"  # あなたのQRコードの画像名
    MARGIN = 0                        # 考慮するプリンタの余白(mm)

    try:
        # ご希望の指定方法に合わせてコメントアウトを外してください。

        # パターン1: 個数(20個)を指定し、用紙全体を使ってQRコードを最大化する
        result_pdf, count, size = generate_custom_qrcode_pdf(
            image_path=TARGET_IMAGE, 
            target_count=None,          
            target_size_mm=30,      
            # target_count=20,          
            # target_size_mm=None,      
            print_margin_mm=MARGIN
        )
        
        # パターン2: 1辺の長さ(30mm)を指定し、入るだけ敷き詰める場合
        # result_pdf, count, size = generate_custom_qrcode_pdf(
        #     image_path=TARGET_IMAGE, 
        #     target_count=None,        
        #     target_size_mm=30.0,      
        #     print_margin_mm=MARGIN
        # )

        # パターン3: サイズと個数の両方を指定する場合
        # result_pdf, count, size = generate_custom_qrcode_pdf(
        #     image_path=TARGET_IMAGE, 
        #     target_count=10,        
        #     target_size_mm=40.0,      
        #     print_margin_mm=MARGIN
        # )

        print(f"成功: {result_pdf} を作成しました！")
        print(f"【結果】QRコード個数: {count}個 / 1辺の長さ: {size:.1f} mm / 考慮した余白: {MARGIN} mm")
        
    except FileNotFoundError as e:
        print(e)
        print("スクリプトと同じフォルダにQRコードの画像を置いて、ファイル名を合わせてください。")
    except ValueError as e:
        print(f"エラー: {e}")