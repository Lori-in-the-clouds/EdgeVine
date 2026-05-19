import os
import cv2
from pathlib import Path

def crop_yolo_dataset(src_dir, dest_dir, padding=10):
    src = Path(src_dir)
    dest = Path(dest_dir)
    
    classes = ['disease', 'healthy', 'stress']
    splits = ['train', 'valid', 'test']
    
    print(f"[*] Inizio ritaglio del dataset YOLO da: {src}")
    print(f"[*] Destinazione classificazione: {dest}")
    
    for split in splits:
        src_split = split
        dest_split = 'val' if split == 'valid' else split
        
        img_dir = src / src_split / 'images'
        lbl_dir = src / src_split / 'labels'
        
        if not img_dir.exists() or not lbl_dir.exists():
            print(f"[!] Cartelle non trovate per lo split {split}, salto.")
            continue
            
        print(f"[*] Elaborazione split: {split} -> {dest_split}...")
        images = [f for f in img_dir.iterdir() if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp']]
        
        count = 0
        for img_path in images:
            lbl_path = lbl_dir / (img_path.stem + '.txt')
            if not lbl_path.exists():
                continue
                
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            h, w = img.shape[:2]
            
            with open(lbl_path, 'r') as f:
                lines = f.readlines()
                
            for idx, line in enumerate(lines):
                parts = line.strip().split()
                if len(parts) < 5:
                    continue
                class_id = int(parts[0])
                if class_id >= len(classes):
                    continue
                    
                class_name = classes[class_id]
                
                if len(parts) == 5:
                    x_c, y_c, bw, bh = map(float, parts[1:5])
                    # Conversione da coordinate normalizzate YOLO a pixel assoluti
                    x1 = int((x_c - bw / 2) * w)
                    y1 = int((y_c - bh / 2) * h)
                    x2 = int((x_c + bw / 2) * w)
                    y2 = int((y_c + bh / 2) * h)
                else:
                    # È un poligono! Formato: class_id x1 y1 x2 y2 ... xN yN
                    coords = list(map(float, parts[1:]))
                    x_coords = coords[0::2]
                    y_coords = coords[1::2]
                    
                    # Calcola la bounding box minima che racchiude il poligono
                    x1 = int(min(x_coords) * w)
                    y1 = int(min(y_coords) * h)
                    x2 = int(max(x_coords) * w)
                    y2 = int(max(y_coords) * h)
                
                # Applicazione del padding di sicurezza
                x1 = max(0, x1 - padding)
                y1 = max(0, y1 - padding)
                x2 = min(w, x2 + padding)
                y2 = min(h, y2 + padding)
                
                crop = img[y1:y2, x1:x2]
                if crop.size == 0:
                    continue
                    
                # Creazione cartella di destinazione per la classe
                save_dir = dest / dest_split / class_name
                save_dir.mkdir(parents=True, exist_ok=True)
                
                save_name = f"{img_path.stem}_crop_{idx}.jpg"
                cv2.imwrite(str(save_dir / save_name), crop)
                count += 1
                
        print(f"[+] Generati {count} ritagli per lo split {dest_split}")
        
    print("[*] Elaborazione completata con successo!")

if __name__ == '__main__':
    SRC = '/Users/lorenzodimaio/Documents/Iot_project/CV/train_classifier/leaf_diesease_merged'
    DEST = '/Users/lorenzodimaio/Documents/Iot_project/CV/dataset_classificazione'
    crop_yolo_dataset(SRC, DEST, padding=10)
