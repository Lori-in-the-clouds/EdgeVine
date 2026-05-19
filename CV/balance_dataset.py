import os
import random
import shutil
from glob import glob

def balance_split(split_dir):
    print(f"\n[*] Bilanciamento dello split: {split_dir}")
    classes = ['disease', 'healthy', 'stress']
    
    # 1. Conta i file esistenti per ogni classe
    class_files = {}
    for c in classes:
        folder = os.path.join(split_dir, c)
        if not os.path.exists(folder):
            print(f"[!] Cartella non trovata: {folder}")
            return
        files = glob(os.path.join(folder, "*.jpg")) + glob(os.path.join(folder, "*.png"))
        class_files[c] = files
        print(f"  - {c}: {len(files)} immagini")
        
    # 2. Trova il numero massimo di immagini tra le classi
    max_count = max(len(files) for files in class_files.values())
    print(f"[*] Target di bilanciamento per classe: {max_count} immagini")
    
    # 3. Esegui l'oversampling (duplicazione casuale) per le classi minoritarie
    for c in classes:
        files = class_files[c]
        current_count = len(files)
        if current_count == 0:
            continue
            
        needed = max_count - current_count
        if needed > 0:
            print(f"[*] Duplicazione di {needed} immagini per la classe '{c}'...")
            for i in range(needed):
                src_file = random.choice(files)
                # Crea un nuovo nome file univoco per evitare sovrascritture
                filename = os.path.basename(src_file)
                name, ext = os.path.splitext(filename)
                dest_file = os.path.join(split_dir, c, f"{name}_dup_{i}{ext}")
                shutil.copy2(src_file, dest_file)
            
            # Riassegna la lista dei file aggiornata
            updated_files = glob(os.path.join(split_dir, c, "*.jpg")) + glob(os.path.join(split_dir, c, "*.png"))
            print(f"  - [OK] Nuova dimensione per '{c}': {len(updated_files)} immagini")
        else:
            print(f"  - '{c}' è già al massimo ({current_count} immagini), nessun campionamento necessario.")

if __name__ == "__main__":
    random.seed(42)
    base_dir = "/Users/lorenzodimaio/Documents/Iot_project/CV/dataset_classificazione"
    
    # Bilancia sia lo split di train che quello di val
    balance_split(os.path.join(base_dir, "train"))
    balance_split(os.path.join(base_dir, "val"))
    
    print("\n[+] Bilanciamento del dataset completato con successo!")
